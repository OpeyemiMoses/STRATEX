import axios from 'axios';
import { getBalance, deductBalance, addBalance } from './paperWallet.js';
import { saveBots } from '../routes/bots.js';
import { archiveBot } from './tradeHistory.js';

let botsRef = null;
const ONE_HOUR_MS = 60 * 1000;

export const initSimulator = (getBots, setBots) => {
  botsRef = getBots;
  setBotsRef = setBots;
  setInterval(checkBots, 5000);
  setInterval(cleanupClosedBots, 60000);
  console.log('Simulation engine started — checking every 5s');
};

let setBotsRef = null;

const cleanupClosedBots = () => {
  const bots = botsRef();
  const now = Date.now();
  const toKeep = [];

  for (const bot of bots) {
    if (bot.status === 'closed' && bot.closedAt) {
      const closedTime = new Date(bot.closedAt).getTime();
      if (now - closedTime >= ONE_HOUR_MS) {
        archiveBot(bot);
        console.log(`[CLEANUP] Archived and removing bot ${bot.name} (closed ${Math.round((now - closedTime) / 60000)}min ago)`);
        continue; // skip adding to toKeep — effectively deletes it
      }
    }
    toKeep.push(bot);
  }

  if (toKeep.length !== bots.length) {
    setBotsRef(toKeep);
  }
};
const getPrice = async (symbol) => {
  try {
    const res = await axios.get(
      `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`
    );
    const ticker = res.data?.data?.[0];
    return ticker ? parseFloat(ticker.lastPr) : null;
  } catch (err) {
    console.error(`Simulator price fetch error for ${symbol}:`, err.message);
    return null;
  }
};

const checkBots = async () => {
  const bots = botsRef();
  const activeBots = bots.filter((b) => b.status === 'active');

  for (const bot of activeBots) {
    const price = await getPrice(bot.asset);
    if (price === null) continue;

   if (!bot.position || bot.position === 'pending') {
      const entryHit =
        bot.entryType === 'market' ||
        (bot.side !== 'short' && price <= bot.entryPrice) ||
        (bot.side === 'short' && price >= bot.entryPrice);

    if (entryHit) {
        const currentBalance = getBalance(bot.walletAddress);
        const positionValueUSDT = bot.positionSize
          ? (bot.positionSize / 100) * currentBalance
          : 0;

        if (positionValueUSDT > currentBalance) {
          console.log(`[SIM] ${bot.name} skipped — insufficient paper balance`);
          continue;
        }

        deductBalance(bot.walletAddress, positionValueUSDT);

        bot.position = 'open';
        bot.filledEntry = price;
        bot.filledAt = new Date().toISOString();
        bot.positionValueUSDT = positionValueUSDT;
        bot.tradelog = bot.tradelog || [];
     bot.tradelog.unshift({
          time: new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          }),
          side: bot.side === 'short' ? 'Short' : 'Long',
          price: price.toFixed(2),
          size: bot.positionSize ? `${bot.positionSize}% ($${positionValueUSDT.toFixed(2)})` : '—',
          pnl: '—',
          type: 'entry',
        });
        console.log(`[SIM] ${bot.name} entry filled at ${price}, position value $${positionValueUSDT.toFixed(2)}`);
        saveBots();
      }
    } else if (bot.position === 'open') {
      const isShort = bot.side === 'short';
      const tpHit = isShort ? price <= bot.takeProfit : price >= bot.takeProfit;
      const slHit = isShort ? price >= bot.stopLoss : price <= bot.stopLoss;

      // Always update unrealized P&L on every check, regardless of TP/SL
      const liveUnrealizedPercent = isShort
        ? ((bot.filledEntry - price) / bot.filledEntry) * 100
        : ((price - bot.filledEntry) / bot.filledEntry) * 100;
      bot.unrealizedPnlPercent = liveUnrealizedPercent;
      bot.unrealizedPnl = bot.positionValueUSDT * (liveUnrealizedPercent / 100);
      bot.lastPrice = price;
      saveBots();

      if (tpHit || slHit) {
        const pnlPercent = isShort
          ? ((bot.filledEntry - price) / bot.filledEntry) * 100
          : ((price - bot.filledEntry) / bot.filledEntry) * 100;

        const dollarPnl = bot.positionValueUSDT * (pnlPercent / 100);
        const returnedAmount = bot.positionValueUSDT + dollarPnl;
        addBalance(bot.walletAddress, returnedAmount);

        bot.position = 'closed';
        bot.pnl = (bot.pnl || 0) + dollarPnl;
        bot.pnlPercent = pnlPercent;
        bot.trades = (bot.trades || 0) + 1;
        const wins = (bot.wins || 0) + (pnlPercent > 0 ? 1 : 0);
        bot.wins = wins;
        bot.winRate = (wins / bot.trades) * 100;

        bot.tradelog = bot.tradelog || [];
        bot.tradelog.unshift({
          time: new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          }),
          side: isShort ? 'Cover' : 'Sell',
          price: price.toFixed(2),
          size: bot.positionSize ? `${bot.positionSize}%` : '—',
          pnl: `${dollarPnl >= 0 ? '+' : ''}$${dollarPnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`,
          type: tpHit ? 'take-profit' : 'stop-loss',
        });

        console.log(`[SIM] ${bot.name} closed at ${price} — ${tpHit ? 'TP' : 'SL'} hit, P&L $${dollarPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

        // Clear unrealized fields — trade is now realized
        bot.unrealizedPnl = null;
        bot.unrealizedPnlPercent = null;

        // One-shot: bot stops after a single trade completes
        bot.status = 'closed';
        bot.closedAt = new Date().toISOString();
        saveBots();
      }
    }
  }
};