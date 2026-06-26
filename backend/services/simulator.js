import axios from 'axios';
import { getBalance, deductBalance, addBalance } from './paperWallet.js';
import { saveBots } from '../routes/bots.js';
import { archiveBot } from './tradeHistory.js';
import { shouldReevaluate, reevaluatePosition } from './riskMonitor.js';
import {
  calculateLiquidationPrice,
  calculateExposure,
  calculateLeveragedPnl,
  isLiquidated,
} from './leverage.js';

let botsRef = null;
let setBotsRef = null;

export const initSimulator = (getBots, setBots) => {
  botsRef = getBots;
  setBotsRef = setBots;
  setInterval(checkBots, 5000);
  console.log('Simulation engine started — checking every 5s');
};

const getPrice = async (symbol) => {
  try {
    const res = await axios.get('https://api.bitget.com/api/v2/mix/market/ticker', {
      params: { symbol, productType: 'USDT-FUTURES' },
    });
    const ticker = res.data?.data?.[0];
    if (!ticker) return null;
    const lastPrice = parseFloat(ticker.lastPr);
    const markPrice = parseFloat(ticker.markPrice);
    return {
      lastPrice,
      markPrice: !isNaN(markPrice) ? markPrice : lastPrice,
    };
  } catch (err) {
    console.error(`Simulator price fetch error for ${symbol}:`, err.message);
    return null;
  }
};

const checkBots = async () => {
  const bots = botsRef();
  const activeBots = bots.filter((b) => b.status === 'active');

  for (const bot of activeBots) {
    const priceData = await getPrice(bot.asset);
    if (priceData === null) continue;
    const { lastPrice: price, markPrice } = priceData;

    if (!bot.position || bot.position === 'pending') {
      const entryHit =
        bot.entryType === 'market' ||
        (bot.side !== 'short' && price <= bot.entryPrice) ||
        (bot.side === 'short' && price >= bot.entryPrice);

      if (entryHit) {
        const currentBalance = getBalance(bot.walletAddress);
        const margin = bot.positionSize ? (bot.positionSize / 100) * currentBalance : 0;

        if (margin > currentBalance) {
          console.log(`[SIM] ${bot.name} skipped — insufficient paper balance`);
          continue;
        }

        deductBalance(bot.walletAddress, margin);

        bot.position = 'open';
        bot.filledEntry = price;
        bot.filledAt = new Date().toISOString();
        bot.positionValueUSDT = margin;
        bot.exposure = calculateExposure(margin, bot.leverage || 1);
        bot.quantity = bot.exposure / price;

        if (!bot.liquidationPrice) {
          bot.liquidationPrice = calculateLiquidationPrice(price, bot.side, bot.leverage || 1);
        }

        bot.openedWith = {
          filledEntry: price,
          filledAt: bot.filledAt,
          stopLoss: bot.stopLoss,
          takeProfit: bot.takeProfit,
          leverage: bot.leverage || 1,
          side: bot.side,
          positionSize: bot.positionSize,
          entryType: bot.entryType,
          strategySource: bot.strategySource || null,
        };

        bot.tradelog = bot.tradelog || [];
        bot.tradelog.unshift({
          time: new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          }),
          timestamp: new Date().toISOString(),
          side: bot.side === 'short' ? 'Short' : 'Long',
          price: price.toFixed(2),
          quantity: bot.quantity,
          size: bot.positionSize
            ? `${bot.positionSize}% ($${margin.toFixed(2)} margin${bot.leverage > 1 ? `, ${bot.leverage}x = $${bot.exposure.toFixed(2)} exposure` : ''})`
            : '—',
          pnl: '—',
          balanceChange: -margin,
          type: 'entry',
        });
        console.log(`[SIM] ${bot.name} entry filled at ${price}, margin $${margin.toFixed(2)}${bot.leverage > 1 ? `, ${bot.leverage}x exposure $${bot.exposure.toFixed(2)}` : ''}`);
        saveBots();
      }
    } else if (bot.position === 'open') {
      const isShort = bot.side === 'short';

      // --- Liquidation check — takes priority over TP/SL ---
      if (isLiquidated(markPrice, bot.liquidationPrice, bot.side)) {
        const margin = bot.positionValueUSDT;
        bot.position = 'closed';
        bot.pnl = (bot.pnl || 0) - margin;
        bot.pnlPercent = -100;
        bot.trades = (bot.trades || 0) + 1;
        bot.winRate = ((bot.wins || 0) / bot.trades) * 100;

        bot.tradelog = bot.tradelog || [];
        bot.tradelog.unshift({
          time: new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          }),
          timestamp: new Date().toISOString(),
          side: 'Liquidated',
          price: markPrice.toFixed(2),
          quantity: bot.quantity,
          size: '—',
          pnl: `-$${margin.toFixed(2)} (-100%)`,
          balanceChange: 0,
          type: 'liquidation',
        });
        console.log(`[SIM] ${bot.name} LIQUIDATED at mark ${markPrice} (last ${price}) — margin $${margin.toFixed(2)} lost entirely`);

        bot.unrealizedPnl = null;
        bot.unrealizedPnlPercent = null;
        bot.status = 'closed';
        bot.closedAt = new Date().toISOString();
        archiveBot(bot);
        addBalance(bot.walletAddress, 0, -margin);

        const idx = botsRef().indexOf(bot);
        if (idx !== -1) botsRef().splice(idx, 1);
        saveBots();
        continue;
      }

      // Update unrealized P&L every tick
      const { pnl: liveUnrealizedPnl, pnlPercent: liveUnrealizedPercent } = calculateLeveragedPnl(
        bot.filledEntry, price, bot.side, bot.positionValueUSDT, bot.leverage || 1
      );
      bot.unrealizedPnlPercent = liveUnrealizedPercent;
      bot.unrealizedPnl = liveUnrealizedPnl;
      bot.lastPrice = price;
      saveBots();

      if (shouldReevaluate(bot, price)) {
        await reevaluatePosition(bot, price);
        saveBots();
      }

      const tpHit = isShort ? price <= bot.takeProfit : price >= bot.takeProfit;
      const slHit = isShort ? price >= bot.stopLoss : price <= bot.stopLoss;

      if (tpHit || slHit) {
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
          balanceChange: returnedAmount,
          type: tpHit ? 'take-profit' : 'stop-loss',
        });

        console.log(`[SIM] ${bot.name} closed at ${price} — ${tpHit ? 'TP' : 'SL'} hit, P&L $${dollarPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

        bot.unrealizedPnl = null;
        bot.unrealizedPnlPercent = null;
        bot.status = 'closed';
        bot.closedAt = new Date().toISOString();

        archiveBot(bot);
        const idx = botsRef().indexOf(bot);
        if (idx !== -1) botsRef().splice(idx, 1);

        saveBots();
      }
    }
  }
};