#!/usr/bin/env node
/**
 * Trading log exporter -- generates trading-log.csv and trading-log.md
 * directly from backend/data/bots.json and backend/data/trade-history.json.
 *
 * Produces exactly the columns required by the hackathon submission
 * checklist: timestamp, trading pair, direction, price, quantity, account
 * balance change -- one row per actual fill (entry leg + exit leg per
 * trade, matching a real exchange statement), not one row per completed
 * round-trip.
 *
 * Run from the backend/ directory:
 *   node scripts/export-trading-log.js
 *
 * Reads from disk directly -- no running server required. Safe to run
 * locally against a copy of the data files, or directly on Railway via its
 * shell if you want the live production ledger.
 *
 * Includes every wallet that has ever traded (the full ledger), across
 * both currently-active bots and the permanent archive in trade-history.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_FILE = path.join(__dirname, '../data/bots.json');
const HISTORY_FILE = path.join(__dirname, '../data/trade-history.json');
const OUTPUT_DIR = path.join(__dirname, '../../trading-log'); // repo root level, easy to find and commit

const loadJson = (filePath, label) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: ${label} not found at ${filePath} -- treating as empty.`);
      return [];
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read ${label}:`, err.message);
    return [];
  }
};

/**
 * Map a single tradelog entry + its parent bot/record into one normalized
 * row matching the 6 required columns.
 */
const normalizeRow = (entry, parent) => {
  // 'side' on the tradelog entry is the actual fill direction at THIS leg
  // (e.g. 'Long'/'Short' on entry, 'Sell'/'Cover'/'Liquidated' on exit) --
  // map it to a plain buy/sell direction for the "direction" column, since
  // that's what the checklist actually asks for, not long/short framing.
  const sideLower = (entry.side || '').toLowerCase();
  let direction;
  if (sideLower === 'long' || sideLower === 'cover') direction = 'buy';
  else if (sideLower === 'short' || sideLower === 'sell' || sideLower === 'liquidated') direction = 'sell';
  else direction = sideLower || 'unknown';

  return {
    timestamp: entry.timestamp || entry.time || 'unknown',
    pair: parent.asset || 'unknown',
    direction,
    price: entry.price ?? '',
    quantity: entry.quantity != null ? Number(entry.quantity).toFixed(6) : '',
    balanceChange: entry.balanceChange != null ? Number(entry.balanceChange).toFixed(2) : '',
    walletAddress: parent.walletAddress || 'anonymous',
    botName: parent.name || parent.botName || 'unknown',
    type: entry.type || 'unknown',
  };
};

const buildLedger = () => {
  const activeBots = loadJson(BOTS_FILE, 'bots.json');
  const archivedTrades = loadJson(HISTORY_FILE, 'trade-history.json');

  const rows = [];

  // Active bots -- their tradelog reflects entries/exits that have happened
  // so far, even if the bot is still open (e.g. an entry fill with no exit yet).
  for (const bot of activeBots) {
    for (const entry of bot.tradelog || []) {
      rows.push(normalizeRow(entry, bot));
    }
  }

  // Archived (closed) bots -- same tradelog shape, stored under a slightly
  // different parent field naming (botName vs name), handled in normalizeRow.
  for (const record of archivedTrades) {
    for (const entry of record.tradelog || []) {
      rows.push(normalizeRow(entry, record));
    }
  }

  // Sort oldest-first by timestamp where parseable, unparseable/missing
  // timestamps sort last rather than crashing the sort.
  rows.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    const va = isNaN(ta) ? Infinity : ta;
    const vb = isNaN(tb) ? Infinity : tb;
    return va - vb;
  });

  return rows;
};

const escapeCsvField = (value) => {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const writeCsv = (rows, outputPath) => {
  const headers = ['timestamp', 'trading_pair', 'direction', 'price', 'quantity', 'account_balance_change', 'wallet_address', 'bot_name', 'event_type'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.timestamp, r.pair, r.direction, r.price, r.quantity, r.balanceChange, r.walletAddress, r.botName, r.type,
    ].map(escapeCsvField).join(','));
  }
  fs.writeFileSync(outputPath, lines.join('\n') + '\n');
};

const writeMarkdown = (rows, outputPath) => {
  const lines = [
    '# Stratex Trading Log',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total fills: ${rows.length}`,
    '',
    '| Timestamp | Trading Pair | Direction | Price | Quantity | Account Balance Change | Wallet | Bot | Event |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const balanceChangeDisplay = r.balanceChange !== '' ? `${Number(r.balanceChange) >= 0 ? '+' : ''}$${r.balanceChange}` : '';
    lines.push(
      `| ${r.timestamp} | ${r.pair} | ${r.direction} | ${r.price} | ${r.quantity} | ${balanceChangeDisplay} | \`${r.walletAddress}\` | ${r.botName} | ${r.type} |`
    );
  }
  fs.writeFileSync(outputPath, lines.join('\n') + '\n');
};

const main = () => {
  const rows = buildLedger();

  if (rows.length === 0) {
    console.warn('No trades found in bots.json or trade-history.json -- nothing to export.');
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const csvPath = path.join(OUTPUT_DIR, 'trading-log.csv');
  const mdPath = path.join(OUTPUT_DIR, 'trading-log.md');

  writeCsv(rows, csvPath);
  writeMarkdown(rows, mdPath);

  console.log(`Exported ${rows.length} fills.`);
  console.log(`  CSV:      ${csvPath}`);
  console.log(`  Markdown: ${mdPath}`);
};

main();