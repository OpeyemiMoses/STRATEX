import { fetchHistoricalCandles } from './marketRegime.js';

/**
 * Classifies the CURRENT market state for a pair -- as opposed to
 * marketRegime.js's getRegimeSegments(), which splits a long historical
 * window into past regimes for backtesting. This module answers a
 * different question: "what are conditions like RIGHT NOW, for the
 * purpose of deciding whether to deploy a new strategy on this pair?"
 *
 * Reuses the same underlying candle fetcher so both modules stay
 * consistent about what counts as "trending" vs "volatile" -- there is
 * exactly one definition of these terms in the codebase, not two that
 * could disagree with each other.
 */

const RECENT_WINDOW_CANDLES = 48; // ~2 days of 1h candles, ~48 hours of recent behavior

/**
 * @param {string} symbol
 * @param {string} timeframe
 * @returns {Promise<{
 *   regime: string,
 *   regimeDisplay: string,
 *   stats: { netChangePercent, annualizedVolPercent, avgVolume, maxDrawdownPercent },
 *   liquidityFlag: 'normal' | 'low',
 *   currentPrice: number | null,
 * } | null>} null if no usable data could be fetched
 */
export const getCurrentMarketState = async (symbol, timeframe = '1h') => {
  const candles = await fetchHistoricalCandles(symbol, timeframe, RECENT_WINDOW_CANDLES);
  if (candles.length < 10) return null; // not enough recent data to say anything meaningful

  const closes = candles.map((c) => c.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const netChangePercent = ((last - first) / first) * 100;

  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const annualizedVolPercent = stdDev * Math.sqrt(365 * 24) * 100; // hourly-bar annualization

  let peak = closes[0];
  let maxDrawdownPercent = 0;
  for (const price of closes) {
    if (price > peak) peak = price;
    const drawdown = ((price - peak) / peak) * 100;
    if (drawdown < maxDrawdownPercent) maxDrawdownPercent = drawdown;
  }

  const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length;
  // Compare this window's average volume to the most recent few candles --
  // a simple, defensible "is liquidity drying up right now" signal rather
  // than an absolute volume threshold that would need per-asset tuning.
  const recentVolume = candles.slice(-6).reduce((s, c) => s + c.volume, 0) / 6;
  const liquidityFlag = recentVolume < avgVolume * 0.4 ? 'low' : 'normal';

  let regime;
  if (annualizedVolPercent > 90) regime = 'high_volatility';
  else if (netChangePercent > 5) regime = 'bull';
  else if (netChangePercent < -5) regime = 'bear';
  else regime = 'sideways';

  const REGIME_DISPLAY = {
    bull: 'Trending up',
    bear: 'Trending down',
    sideways: 'Ranging / sideways',
    high_volatility: 'Highly volatile',
  };

  return {
    regime,
    regimeDisplay: REGIME_DISPLAY[regime],
    stats: {
      netChangePercent: parseFloat(netChangePercent.toFixed(2)),
      annualizedVolPercent: parseFloat(annualizedVolPercent.toFixed(1)),
      avgVolume: parseFloat(avgVolume.toFixed(2)),
      maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
    },
    liquidityFlag,
    currentPrice: last,
  };
};

/**
 * Decide whether a given strategy shape is well-matched to the current
 * regime, badly mismatched, or borderline -- used to drive the
 * trade/no-trade veto and the strategy explanation text.
 *
 * This is intentionally simple, rule-based logic (not another Qwen call)
 * for the structural mismatch checks, since "a tight scalp strategy makes
 * no sense in a dead-flat low-volatility market" is a deterministic fact
 * about the numbers, not something that benefits from an LLM's judgment --
 * keeping it rule-based also means this check is instant and free to run
 * on every parse, not gated behind an extra AI call's latency/cost.
 *
 * @param {Object} marketState - result from getCurrentMarketState
 * @param {Object} strategy - parsed strategy fields (entryPrice, takeProfitPrice, stopLossPrice, etc.)
 * @returns {{ mismatch: boolean, severity: 'none'|'mild'|'severe', reason: string|null }}
 */
export const assessStrategyFit = (marketState, strategy) => {
  if (!marketState) {
    return { mismatch: false, severity: 'none', reason: null };
  }

  const { regime, liquidityFlag, currentPrice } = marketState;

  if (liquidityFlag === 'low') {
    return {
      mismatch: true,
      severity: 'severe',
      reason: 'Recent trading volume on this pair has dropped sharply -- liquidity is thin right now, which means fills may slip and stop-losses may not execute at the expected price.',
    };
  }

  // Tight-target check: if both TP and SL are within a very small % of
  // current price, and the market is in a high-volatility regime, normal
  // noise is likely to trigger an exit almost immediately regardless of
  // direction -- a structural mismatch, not a matter of opinion.
  if (regime === 'high_volatility' && currentPrice) {
    const tp = strategy.takeProfitPrice;
    const sl = strategy.stopLossPrice;
    if (tp && sl) {
      const tpDistance = Math.abs((tp - currentPrice) / currentPrice) * 100;
      const slDistance = Math.abs((sl - currentPrice) / currentPrice) * 100;
      if (tpDistance < 1 && slDistance < 1) {
        return {
          mismatch: true,
          severity: 'severe',
          reason: `${marketState.regimeDisplay} conditions mean price is moving more than ${marketState.stats.annualizedVolPercent}% annualized -- a take-profit/stop-loss this tight (under 1% away) is very likely to be hit by normal noise within minutes, regardless of the actual trend.`,
        };
      }
    }
  }

  // Sideways market + a strongly directional, wide-target strategy: not
  // dangerous, just statistically less likely to pay off until the range breaks.
  if (regime === 'sideways') {
    const tp = strategy.takeProfitPrice;
    if (tp && currentPrice) {
      const tpDistance = Math.abs((tp - currentPrice) / currentPrice) * 100;
      if (tpDistance > 8) {
        return {
          mismatch: true,
          severity: 'mild',
          reason: `This pair has been ranging with no clear trend recently (net move of ${marketState.stats.netChangePercent}% over the recent window) -- a take-profit target this far away (${tpDistance.toFixed(1)}%) may take a long time to reach, or never trigger, if the range holds.`,
        };
      }
    }
  }

  return { mismatch: false, severity: 'none', reason: null };
};