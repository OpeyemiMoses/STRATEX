import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/decision-log.json');
const MAX_ENTRIES = 2000;

const loadLog = () => {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    console.error('Failed to load decision-log.json:', err.message);
  }
  return [];
};

let log = loadLog();

const saveLog = () => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('Failed to save decision-log.json:', err.message);
  }
};

/**
 * Append a decision/reasoning entry to the log.
 *
 * @param {Object} entry
 * @param {string} entry.type          - 'sl_tp_adjustment' | 'risk_assessment' | 'audit_flag' | 'general'
 * @param {string|null} entry.botId   - bot this relates to, or null for wallet-level entries
 * @param {string|null} entry.walletAddress - wallet this relates to, if applicable
 * @param {string} entry.reasoning    - plain-English explanation shown in the console UI
 * @param {Object} [entry.data]       - structured payload (e.g. { oldSL, newSL, oldTP, newTP, price })
 * @param {string} [entry.severity]   - 'info' | 'warning' | 'critical'
 */
export const logDecision = ({ type, botId = null, walletAddress = null, reasoning, data = {}, severity = 'info' }) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    botId,
    walletAddress,
    reasoning,
    data,
    severity,
  };

  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log = log.slice(0, MAX_ENTRIES);
  saveLog();

  console.log(`[DECISION-LOG] ${type}${botId ? ` bot=${botId}` : ''} — ${reasoning}`);

  return entry;
};

/**
 * Get recent entries, optionally filtered.
 *
 * @param {Object} opts
 * @param {number} [opts.limit=50]
 * @param {string} [opts.botId]          - filter to a specific bot
 * @param {string} [opts.walletAddress]  - filter to a specific wallet
 * @param {string} [opts.type]           - filter to a specific entry type
 * @param {string} [opts.since]          - ISO timestamp; only entries after this
 */
export const getRecentDecisions = ({ limit = 50, botId, walletAddress, type, since } = {}) => {
  let results = log;
  if (botId) results = results.filter(e => e.botId === botId);
  if (walletAddress) results = results.filter(e => e.walletAddress === walletAddress);
  if (type) results = results.filter(e => e.type === type);
  if (since) {
    const sinceTime = new Date(since).getTime();
    results = results.filter(e => new Date(e.timestamp).getTime() > sinceTime);
  }
  return results.slice(0, limit);
};

export const getBotDecisionHistory = (botId) =>
  log.filter(e => e.botId === botId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

/**
 * Remove all log entries belonging to a wallet.
 * Called by DELETE /api/decisions/clear?wallet=...
 *
 * @param {string} walletAddress
 */
export const clearWalletDecisions = (walletAddress) => {
  log = log.filter(e => e.walletAddress !== walletAddress);
  saveLog();
};