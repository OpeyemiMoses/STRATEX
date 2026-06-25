import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/trade-history.json');

const loadHistory = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load trade-history.json:', err.message);
  }
  return [];
};

let history = loadHistory();

const saveHistory = () => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Failed to save trade-history.json:', err.message);
  }
};

// Archive a bot's full trade record before it gets deleted
export const archiveBot = (bot) => {
  history.unshift({
    index: history.length + 1,
    botId: bot.id,
    botName: bot.name,
    asset: bot.asset,
    side: bot.side || 'long',
    walletAddress: bot.walletAddress,
    strategy: bot.strategy,
    entryType: bot.entryType,
    entryPrice: bot.entryPrice,
    filledEntry: bot.filledEntry,
    takeProfit: bot.takeProfit,
    stopLoss: bot.stopLoss,
    positionSize: bot.positionSize,
    positionValueUSDT: bot.positionValueUSDT,
    quantity: bot.quantity || null, // units of the base asset -- null for bots archived before this field existed
    leverage: bot.leverage || 1,
    liquidationPrice: bot.liquidationPrice || null,
    finalPnl: bot.pnl,
    finalPnlPercent: bot.pnlPercent,
    trades: bot.trades,
    tradelog: bot.tradelog,
    createdAt: bot.createdAt,
    closedAt: bot.closedAt || new Date().toISOString(),
    archivedAt: new Date().toISOString(),
  });
  saveHistory();
};

export const getHistory = (walletAddress) => {
  if (!walletAddress) return history;
  return history.filter(h => h.walletAddress === walletAddress);
};