import { getRegimeSegments } from './marketRegime.js';
import { replayStrategyOnCandles, computeMetrics } from './backtestEngine.js';

const STARTING_BALANCE_FOR_SCORING = 10000;

/**
 * Run the full real multi-regime backtest against a proposed strategy
 * BEFORE it becomes a bot, and produce a four-dimension confidence rating.
 * This reuses backtestEngine.js and marketRegime.js exactly as the
 * standalone /api/backtest/run route does -- the same replay logic, the
 * same leverage math, the same regime classification. The only difference
 * is WHEN it runs: here, it's part of the creation pipeline, gating
 * whether/how a bot gets deployed, rather than something you ask for
 * afterward.
 *
 * @param {Object} strategyConfig - same shape backtestEngine.js expects:
 *   { side, entryType, entryPrice, stopLoss, takeProfit, positionSizePercent, leverage }
 * @param {string} asset
 * @param {string} timeframe
 * @returns {Promise<{
 *   robustnessScore: number,
 *   riskLevel: 'low'|'medium'|'high',
 *   overfittingRisk: 'low'|'medium'|'high',
 *   marketAdaptability: 'low'|'medium'|'high',
 *   aggregateMetrics: object,
 *   regimeResults: Array,
 *   explanation: string,
 * } | null>} null if there wasn't enough historical data to test at all
 */
export const computeConfidenceRating = async (strategyConfig, asset, timeframe = '1h') => {
  const segments = await getRegimeSegments(asset, timeframe, 5);
  if (segments.length === 0) return null;

  const regimeResults = segments.map((segment) => {
    const { trades } = replayStrategyOnCandles(strategyConfig, segment.candles, STARTING_BALANCE_FOR_SCORING);
    const metrics = computeMetrics(trades, STARTING_BALANCE_FOR_SCORING);
    return { label: segment.label, stats: segment.stats, metrics };
  });

  const tested = regimeResults.filter((r) => r.metrics.totalTrades > 0);
  const allTrades = regimeResults.flatMap((r, i) =>
    replayStrategyOnCandles(strategyConfig, segments[i].candles, STARTING_BALANCE_FOR_SCORING).trades
  );
  const aggregateMetrics = computeMetrics(allTrades, STARTING_BALANCE_FOR_SCORING);

  // --- Robustness score: % of tested regimes that were profitable ---
  const profitableCount = tested.filter((r) => r.metrics.totalReturn > 0).length;
  const robustnessScore = tested.length > 0 ? Math.round((profitableCount / tested.length) * 100) : 0;

  // --- Risk level: driven by max drawdown and leverage together ---
  const worstDrawdown = Math.min(...regimeResults.map((r) => r.metrics.maxDrawdown), 0);
  const leverage = strategyConfig.leverage || 1;
  let riskLevel;
  if (leverage >= 10 || worstDrawdown < -25) riskLevel = 'high';
  else if (leverage >= 3 || worstDrawdown < -10) riskLevel = 'medium';
  else riskLevel = 'low';

  // --- Overfitting risk: a strategy that looks great in exactly one regime
  // and mediocre/bad everywhere else is a classic overfitting signature --
  // it was likely shaped (consciously or not) around one kind of market
  // behavior rather than a genuinely general edge. ---
  let overfittingRisk;
  if (tested.length <= 1) {
    overfittingRisk = 'high'; // can't even assess generality with one data point
  } else {
    const returns = tested.map((r) => r.metrics.totalReturn);
    const best = Math.max(...returns);
    const others = returns.filter((r) => r !== best);
    const avgOthers = others.reduce((s, r) => s + r, 0) / others.length;
    // If the best regime massively outperforms the average of the rest,
    // that's a concentration-of-edge signal.
    overfittingRisk = best > 0 && (best - avgOthers) > 25 ? 'high' : (best - avgOthers) > 10 ? 'medium' : 'low';
  }

  // --- Market adaptability: how many distinct regimes it stayed profitable in ---
  const adaptabilityRatio = tested.length > 0 ? profitableCount / tested.length : 0;
  const marketAdaptability = adaptabilityRatio >= 0.75 ? 'high' : adaptabilityRatio >= 0.4 ? 'medium' : 'low';

  // --- Plain-English explanation, replacing "Generated bot successfully" ---
  const regimeLabels = { bull: 'bull markets', bear: 'bear markets', sideways: 'sideways/ranging markets', high_volatility: 'high-volatility conditions' };
  const bestRegime = tested.length > 0
    ? tested.reduce((best, r) => (r.metrics.totalReturn > best.metrics.totalReturn ? r : best), tested[0])
    : null;
  const worstRegime = tested.length > 0
    ? tested.reduce((worst, r) => (r.metrics.totalReturn < worst.metrics.totalReturn ? r : worst), tested[0])
    : null;

  let explanation;
  if (!bestRegime) {
    explanation = 'Not enough historical data was available to characterize this strategy\'s behavior.';
  } else if (robustnessScore >= 80) {
    explanation = `This strategy held up well across nearly every market condition tested, including ${regimeLabels[bestRegime.label]}. It does not appear to depend on one specific kind of market behavior to be profitable.`;
  } else if (robustnessScore === 0) {
    explanation = `This strategy was unprofitable in every tested historical regime, including ${regimeLabels[worstRegime.label]}. Its current parameters do not show a real historical edge.`;
  } else {
    explanation = `This strategy performed best in ${regimeLabels[bestRegime.label]} but struggled in ${regimeLabels[worstRegime.label]}. It is regime-dependent -- expect it to behave very differently if market conditions change from what they are now.`;
  }

  return {
    robustnessScore,
    riskLevel,
    overfittingRisk,
    marketAdaptability,
    aggregateMetrics,
    regimeResults,
    explanation,
  };
};