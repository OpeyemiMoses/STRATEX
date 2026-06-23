import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWallet, deductBalance, addBalance } from '../services/paperWallet.js';
import { getHistory, archiveBot } from '../services/tradeHistory.js';
import { calculateLiquidationPrice, calculateLeveragedPnl } from '../services/leverage.js';
import { auditBot } from '../services/botAuditor.js';
import { auditWallet } from '../services/walletAuditor.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/bots.json');

const router = express.Router();

const sign = (timestamp, method, path, body = '') => {
  const message = timestamp + method + path + body;
  return crypto
    .createHmac('sha256', process.env.BITGET_SECRET_KEY)
    .update(message)
    .digest('base64');
};

const bitgetHeaders = (method, path, body = '') => {
  const timestamp = Date.now().toString();
  return {
    'ACCESS-KEY': process.env.BITGET_API_KEY,
    'ACCESS-SIGN': sign(timestamp, method, path, body),
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': process.env.BITGET_PASSPHRASE,
    'Content-Type': 'application/json',
    'locale': 'en-US',
  };
};

const loadBots = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load bots.json:', err.message);
  }
  return [];
};

export const saveBots = () => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(bots, null, 2));
  } catch (err) {
    console.error('Failed to save bots.json:', err.message);
  }
};

let bots = loadBots();

export const getBots = () => bots;
export const setBots = (newBots) => {
  bots = newBots;
  saveBots();
};

router.get('/', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json(bots);
  res.json(bots.filter(b => b.walletAddress === wallet));
});

router.get('/wallet/:address', (req, res) => {
  const wallet = getWallet(req.params.address);
  res.json(wallet);
});

router.get('/history/:address', (req, res) => {
  res.json(getHistory(req.params.address));
});

router.post('/wallet/:address/audit', async (req, res) => {
  const { address } = req.params;
  const activeBotsForWallet = bots.filter(b => b.walletAddress === address);
  try {
    const result = await auditWallet(address, activeBotsForWallet);
    res.json(result);
  } catch (err) {
    console.error('Wallet audit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: close a bot's open position and archive it
const closeOpenPosition = async (bot) => {
  const pricePath = `/api/v2/spot/market/tickers?symbol=${bot.asset}`;
  const priceRes = await axios.get(`https://api.bitget.com${pricePath}`);
  const price = parseFloat(priceRes.data?.data?.[0]?.lastPr);
  if (!price) throw new Error('Could not fetch current price');

  const { pnl: dollarPnl, pnlPercent } = calculateLeveragedPnl(
    bot.filledEntry, price, bot.side, bot.positionValueUSDT, bot.leverage || 1
  );

  const returnedAmount = bot.positionValueUSDT + dollarPnl;
  addBalance(bot.walletAddress, returnedAmount, dollarPnl); // passes dollarPnl to accumulate totalPnl

  bot.position = 'closed';
  bot.pnl = (bot.pnl || 0) + dollarPnl;
  bot.pnlPercent = pnlPercent;
  bot.trades = (bot.trades || 0) + 1;
  const wins = (bot.wins || 0) + (pnlPercent > 0 ? 1 : 0);
  bot.wins = wins;
  bot.winRate = (wins / bot.trades) * 100;
  bot.unrealizedPnl = null;
  bot.unrealizedPnlPercent = null;
  bot.status = 'closed';
  bot.closedAt = new Date().toISOString();

  bot.tradelog = bot.tradelog || [];
  bot.tradelog.unshift({
    time: new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
    side: bot.side === 'short' ? 'Cover' : 'Sell',
    price: price.toFixed(2),
    size: bot.positionSize ? `${bot.positionSize}%` : '—',
    pnl: `${dollarPnl >= 0 ? '+' : ''}$${dollarPnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`,
    type: 'manual-close',
  });

  archiveBot(bot);
  bots = bots.filter(b => b.id !== bot.id);
  saveBots();
  return { bot, price, dollarPnl };
};

// Manual close
router.post('/:id/close', async (req, res) => {
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (bot.position !== 'open') return res.status(400).json({ error: 'Bot has no open position to close' });

  try {
    const { bot: closedBot } = await closeOpenPosition(bot);
    res.json(closedBot);
  } catch (err) {
    console.error('Manual close error:', err.message);
    res.status(500).json({ error: 'Failed to close position' });
  }
});

// Audit single bot
router.post('/:id/audit', async (req, res) => {
  let bot = bots.find(b => b.id === req.params.id);

  if (!bot) {
    const archived = getHistory().find(h => h.botId === req.params.id);
    if (archived) {
      bot = {
        id: archived.botId, name: archived.botName, asset: archived.asset,
        walletAddress: archived.walletAddress, strategy: archived.strategy,
        entryType: archived.entryType, entryPrice: archived.entryPrice,
        filledEntry: archived.filledEntry, stopLoss: archived.stopLoss,
        takeProfit: archived.takeProfit, positionSize: archived.positionSize,
        status: 'closed', pnl: archived.finalPnl, pnlPercent: archived.finalPnlPercent,
        tradelog: archived.tradelog,
      };
    }
  }

  if (!bot) return res.status(404).json({ error: 'Bot not found in active bots or history' });

  try {
    const result = await auditBot(bot);
    res.json(result);
  } catch (err) {
    console.error('Bot audit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create bot
router.post('/create', (req, res) => {
  const {
    name, asset, timeframe, strategy, side, stopLoss, takeProfit,
    positionSize, entryPrice, entryType, walletAddress, backtestResults, leverage,
  } = req.body;

  const lev = leverage && leverage > 1 ? parseFloat(leverage) : 1;
  const parsedEntryPrice = entryPrice ? parseFloat(entryPrice) : null;
  const resolvedSide = side === 'short' ? 'short' : 'long';

  const newBot = {
    id: Date.now().toString(),
    name, asset, timeframe, strategy,
    side: resolvedSide,
    walletAddress: walletAddress || 'anonymous',
    entryPrice: parsedEntryPrice,
    entryType: entryType || 'limit',
    stopLoss: stopLoss ? parseFloat(stopLoss) : null,
    takeProfit: takeProfit ? parseFloat(takeProfit) : null,
    positionSize, backtestResults,
    status: 'active',
    position: 'pending',
    filledEntry: null,
    tradelog: [],
    pnl: 0, wins: 0,
    winRate: backtestResults?.metrics?.winRate || 0,
    trades: 0,
    createdAt: new Date().toISOString(),
    color: '#1B6FF8',
    leverage: lev,
    liquidationPrice: parsedEntryPrice
      ? calculateLiquidationPrice(parsedEntryPrice, resolvedSide, lev)
      : null,
  };

  bots.unshift(newBot);
  saveBots();
  res.json(newBot);
});

// Toggle status — blocked if position is open
router.patch('/:id/status', (req, res) => {
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });

  if (bot.position === 'open') {
    return res.status(400).json({
      error: 'Cannot pause a bot with an open position. Close the position first.',
    });
  }

  bot.status = req.body.status;
  saveBots();
  res.json(bot);
});

// Delete — forces close first if position is open
router.delete('/:id', async (req, res) => {
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });

  try {
    if (bot.position === 'open') {
      // Close the position first — funds are returned before deletion
      await closeOpenPosition(bot);
      // closeOpenPosition already removes bot from array and saves
    } else {
      bots = bots.filter(b => b.id !== req.params.id);
      saveBots();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete with close error:', err.message);
    res.status(500).json({ error: 'Failed to close position before deleting. Try again.' });
  }
});

router.get('/:id', (req, res) => {
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json(bot);
});

export default router;