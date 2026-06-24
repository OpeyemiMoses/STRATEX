import { calculateLiquidationPrice, calculateExposure, calculateLeveragedPnl, isLiquidated } from './leverage.js';

/**
 * Replay a strategy's entry/TP/SL/liquidation logic against a real
 * historical candle array, bar by bar. This mirrors simulator.js's live
 * logic as closely as possible (same liquidation-priority-over-TP/SL
 * ordering, same margin-vs-exposure leverage math) so backtest numbers are
 * directly comparable to what the bot would actually do live — not a
 * separate, looser approximation.
 *
 * Within each historical segment, the strategy is replayed repeatedly:
 * once a position closes (TP/SL/liquidation), the engine immediately looks
 * for the next entry opportunity in the remaining candles of that segment.
 * This gives a realistic trade count per regime rather than "one trade per
 * segment," which would understate how often the strategy actually fires.
 *
 * @param {Object} strategy
 * @param {string} strategy.side - 'long' | 'short'
 * @param {string} strategy.entryType - 'market' | 'limit'
 * @param {number|null} strategy.entryPrice - required if entryType is 'limit'
 * @param {number} strategy.stopLoss
 * @param {number} strategy.takeProfit
 * @param {number} strategy.positionSizePercent - % of account balance used as margin
 * @param {number} strategy.leverage - 1 if no leverage
 * @param {Array} candles - oldest-first candle array for one regime segment
 * @param {number} startingBalance - account balance at the start of this segment's replay
 * @returns {{ trades: Array, endingBalance: number }}
 */
export const replayStrategyOnCandles = (strategy, candles, startingBalance) => {
  const { side, entryType, entryPrice, stopLoss, takeProfit, positionSizePercent, leverage } = strategy;
  const lev = leverage && leverage > 1 ? leverage : 1;
  const isShort = side === 'short';

  let balance = startingBalance;
  const trades = [];

  let position = null; // null when flat, else { entryFillPrice, margin, exposure, liquidationPrice }

  for (const candle of candles) {
    // Use the candle's close as the reference price for entry/exit checks —
    // a simplification vs. checking high/low intrabar, but consistent with
    // how simulator.js evaluates against a single polled price per tick.
    const price = candle.close;

    if (!position) {
      const entryHit =
        entryType === 'market' ||
        (!isShort && entryPrice && price <= entryPrice) ||
        (isShort && entryPrice && price >= entryPrice);

      if (entryHit) {
        const margin = (positionSizePercent / 100) * balance;
        if (margin <= 0 || margin > balance) continue; // insufficient balance, skip this entry

        const fillPrice = price;
        const exposure = calculateExposure(margin, lev);
        const liquidationPrice = calculateLiquidationPrice(fillPrice, side, lev);

        balance -= margin;
        position = { entryFillPrice: fillPrice, margin, exposure, liquidationPrice, entryTime: candle.time };
      }
      continue;
    }

    // Position is open — check liquidation first (matches simulator.js
    // priority ordering), then TP/SL.
    if (isLiquidated(price, position.liquidationPrice, side)) {
      trades.push({
        entryPrice: position.entryFillPrice,
        exitPrice: price,
        pnl: -position.margin,
        pnlPercent: -100,
        outcome: 'liquidation',
        entryTime: position.entryTime,
        exitTime: candle.time,
      });
      // margin is fully lost — balance already had it deducted, nothing returned
      position = null;
      continue;
    }

    const tpHit = isShort ? price <= takeProfit : price >= takeProfit;
    const slHit = isShort ? price >= stopLoss : price <= stopLoss;

    if (tpHit || slHit) {
      const { pnl, pnlPercent } = calculateLeveragedPnl(
        position.entryFillPrice, price, side, position.margin, lev
      );
      balance += position.margin + pnl;
      trades.push({
        entryPrice: position.entryFillPrice,
        exitPrice: price,
        pnl,
        pnlPercent,
        outcome: tpHit ? 'take_profit' : 'stop_loss',
        entryTime: position.entryTime,
        exitTime: candle.time,
      });
      position = null;
    }
  }

  // If a position is still open at the end of the segment, mark it to
  // market at the last candle's close so it contributes to metrics rather
  // than vanishing silently -- flagged as 'open_at_segment_end' so callers
  // can treat it differently from a genuinely-closed trade if needed.
  if (position) {
    const lastPrice = candles[candles.length - 1].close;
    const { pnl, pnlPercent } = calculateLeveragedPnl(
      position.entryFillPrice, lastPrice, side, position.margin, lev
    );
    trades.push({
      entryPrice: position.entryFillPrice,
      exitPrice: lastPrice,
      pnl,
      pnlPercent,
      outcome: 'open_at_segment_end',
      entryTime: position.entryTime,
      exitTime: candles[candles.length - 1].time,
    });
    balance += position.margin + pnl;
  }

  return { trades, endingBalance: balance };
};

/**
 * Compute aggregate performance metrics from a list of trades, given a
 * starting balance. Returns real numbers derived from the trades, never
 * randomized.
 */
export const computeMetrics = (trades, startingBalance) => {
  if (trades.length === 0) {
    return {
      totalReturn: 0, winRate: 0, totalTrades: 0,
      maxDrawdown: 0, profitFactor: 0, sharpeRatio: 0,
    };
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalReturn = (totalPnl / startingBalance) * 100;
  const winRate = (wins.length / trades.length) * 100;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  // Running-balance drawdown across the trade sequence
  let runningBalance = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  for (const t of trades) {
    runningBalance += t.pnl;
    if (runningBalance > peak) peak = runningBalance;
    const drawdownPercent = ((runningBalance - peak) / peak) * 100;
    if (drawdownPercent < maxDrawdown) maxDrawdown = drawdownPercent;
  }

  // Simplified Sharpe-style ratio: mean trade return / stddev of trade
  // returns. Not annualized against a risk-free rate (this is a paper
  // trading sim, not a fund) — used as a relative consistency measure
  // between strategies/regimes, not as a literal industry-standard Sharpe.
  const pctReturns = trades.map((t) => t.pnlPercent);
  const meanReturn = pctReturns.reduce((s, r) => s + r, 0) / pctReturns.length;
  const variance = pctReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / pctReturns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev === 0 ? 0 : meanReturn / stdDev;

  return {
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    winRate: parseFloat(winRate.toFixed(1)),
    totalTrades: trades.length,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    profitFactor: isFinite(profitFactor) ? parseFloat(profitFactor.toFixed(2)) : null,
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
  };
};