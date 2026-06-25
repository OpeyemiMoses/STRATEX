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
import { computeConfidenceRating } from '../services/confidenceRating.js';
import { auditBot } from '../services/botAuditor.js';
import { auditWallet } from '../services/walletAuditor.js';
import { clampLeverage } from '../services/contractConfig.js';

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

// Get all bots for a specific wallet
router.get('/', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json(bots);
  const filtered = bots.filter(b => b.walletAddress === wallet);
  res.json(filtered);
});

// Get paper wallet balance for a wallet address
router.get('/wallet/:address', (req, res) => {
  const wallet = getWallet(req.params.address);
  res.json(wallet);
});

// Get full trade history (archived closed bots) for a wallet
router.get('/history/:address', (req, res) => {
  const history = getHistory(req.params.address);
  res.json(history);
});

router.post('/wallet/:address/audit', async (req, res) => {
  const { address } = req.params;
  const activeBotsForWallet = bots.filter((b) => b.walletAddress === address);
  try {
    const result = await auditWallet(address, activeBotsForWallet);
    res.json(result);
  } catch (err) {
    console.error('Wallet audit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/close', async (req, res) => {
  console.log('[CLOSE DEBUG] requested id:', req.params.id);
  console.log('[CLOSE DEBUG] available ids:', bots.map(b => b.id));
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (bot.position !== 'open') {
    return res.status(400).json({ error: 'Bot has no open position to close' });
  }

  try {
    const priceRes = await axios.get('https://api.bitget.com/api/v2/mix/market/ticker', {
      params: { symbol: bot.asset, productType: 'USDT-FUTURES' },
    });
    const price = parseFloat(priceRes.data?.data?.[0]?.lastPr);

    if (!price) {
      return res.status(500).json({ error: 'Could not fetch current price' });
    }

    const isShort = bot.side === 'short';
    const { pnl: dollarPnl, pnlPercent } = calculateLeveragedPnl(
      bot.filledEntry, price, bot.side, bot.positionValueUSDT, bot.leverage || 1
    );

    const returnedAmount = bot.positionValueUSDT + dollarPnl;


    addBalance(bot.walletAddress, returnedAmount, dollarPnl);

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
      timestamp: new Date().toISOString(),
      side: isShort ? 'Cover' : 'Sell',
      price: price.toFixed(2),
      quantity: bot.quantity,
      size: bot.positionSize ? `${bot.positionSize}%` : '—',
      pnl: `${dollarPnl >= 0 ? '+' : ''}$${dollarPnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`,
      balanceChange: bot.positionValueUSDT + dollarPnl,
      type: 'manual-close',
    });
    archiveBot(bot);
    bots = bots.filter(b => b.id !== bot.id);
    saveBots();
    res.json(bot);
  } catch (err) {
    console.error('Manual close error:', err.message);
    res.status(500).json({ error: 'Failed to close position' });
  }
});

// Audit a single bot
router.post('/:id/audit', async (req, res) => {
  let bot = bots.find((b) => b.id === req.params.id);

  if (!bot) {
    const archived = getHistory().find((h) => h.botId === req.params.id);
    if (archived) {
      bot = {
        id: archived.botId,
        name: archived.botName,
        asset: archived.asset,
        walletAddress: archived.walletAddress,
        strategy: archived.strategy,
        entryType: archived.entryType,
        entryPrice: archived.entryPrice,
        filledEntry: archived.filledEntry,
        stopLoss: archived.stopLoss,
        takeProfit: archived.takeProfit,
        positionSize: archived.positionSize,
        status: 'closed',
        pnl: archived.finalPnl,
        pnlPercent: archived.finalPnlPercent,
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


router.patch('/:id/position', (req, res) => {
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (bot.position !== 'open') {
    return res.status(400).json({ error: 'Can only edit an open position' });
  }

  const { stopLoss, takeProfit } = req.body;

  if (stopLoss === undefined && takeProfit === undefined) {
    return res.status(400).json({ error: 'Provide stopLoss or takeProfit to update' });
  }

  const oldSL = bot.stopLoss;
  const oldTP = bot.takeProfit;

  if (stopLoss !== undefined) {
    const sl = parseFloat(stopLoss);
    if (isNaN(sl) || sl <= 0) return res.status(400).json({ error: 'Invalid stopLoss value' });
    bot.stopLoss = sl;
  }

  if (takeProfit !== undefined) {
    const tp = parseFloat(takeProfit);
    if (isNaN(tp) || tp <= 0) return res.status(400).json({ error: 'Invalid takeProfit value' });
    bot.takeProfit = tp;
  }

  bot.tradelog = bot.tradelog || [];
  bot.tradelog.unshift({
    time: new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
    timestamp: new Date().toISOString(),
    side: 'Edit',
    price: bot.lastPrice ? String(bot.lastPrice) : '—',
    quantity: null,
    size: '—',
    pnl: `SL: $${bot.stopLoss} · TP: $${bot.takeProfit}`,
    balanceChange: null,
    type: 'position-edit',
  });

  bot.slTpAdjustmentHistory = bot.slTpAdjustmentHistory || [];
  bot.slTpAdjustmentHistory.push({
    timestamp: new Date().toISOString(),
    source: 'user_edit',
    price: bot.lastPrice || null,
    oldStopLoss: oldSL,
    newStopLoss: bot.stopLoss,
    oldTakeProfit: oldTP,
    newTakeProfit: bot.takeProfit,
  });

  saveBots();
  res.json(bot);
});

// Create a new bot
router.post('/create', async (req, res) => {
  const {
    name, asset, timeframe, strategy, side, stopLoss, takeProfit,
    positionSize, entryPrice, entryType, walletAddress, backtestResults,
    leverage,
  } = req.body;

  if (!stopLoss || !takeProfit || !positionSize) {
    return res.status(400).json({
      error: 'A stop-loss, take-profit, and position size are all required to create a bot. Stratex does not deploy bots without basic risk controls.',
    });
  }

  const requestedLeverage = leverage && leverage > 1 ? parseFloat(leverage) : 1;
  const parsedEntryPrice = entryPrice ? parseFloat(entryPrice) : null;
  const resolvedSide = side === 'short' ? 'short' : 'long';

  const leverageResult = await clampLeverage(asset, requestedLeverage);
  const lev = leverageResult.leverage;

  let confidenceRating = null;
  try {
    confidenceRating = await computeConfidenceRating(
      {
        side: resolvedSide,
        entryType: entryType || 'market',
        entryPrice: parsedEntryPrice,
        stopLoss: parseFloat(stopLoss),
        takeProfit: parseFloat(takeProfit),
        positionSizePercent: parseFloat(positionSize),
        leverage: lev,
      },
      asset,
      timeframe || '1h'
    );
  } catch (err) {
    console.error('Confidence rating failed during bot creation:', err.message);
  }

  const newBot = {
    id: Date.now().toString(),
    name,
    asset,
    timeframe,
    strategy,
    side: resolvedSide,
    walletAddress: walletAddress || 'anonymous',
    entryPrice: parsedEntryPrice,
    entryType: entryType || 'limit',
    stopLoss: stopLoss ? parseFloat(stopLoss) : null,
    takeProfit: takeProfit ? parseFloat(takeProfit) : null,
    positionSize,
    backtestResults,
    confidenceRating,
    status: 'active',
    position: 'pending',
    filledEntry: null,
    tradelog: [],
    pnl: 0,
    wins: 0,
    winRate: backtestResults?.metrics?.winRate || 0,
    trades: 0,
    createdAt: new Date().toISOString(),
    color: '#1B6FF8',
    leverage: lev,
    leverageCapped: leverageResult.capped,
    requestedLeverage: leverageResult.requestedLeverage,
    maxAllowedLeverage: leverageResult.maxAllowedLeverage,
    liquidationPrice: parsedEntryPrice
      ? calculateLiquidationPrice(parsedEntryPrice, resolvedSide, lev)
      : null,
    originalAction: side === 'short' ? 'sell' : 'buy',
  };

  bots.unshift(newBot);
  saveBots();
  res.json(newBot);
});

// Update bot status
router.patch('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const bot = bots.find(b => b.id === id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });

  bot.status = status;
  saveBots();
  res.json(bot);
});

// Delete bot
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  bots = bots.filter(b => b.id !== id);
  saveBots();
  res.json({ success: true });
});

// Get single bot
router.get('/:id', (req, res) => {
  const bot = bots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json(bot);
});

export default router;