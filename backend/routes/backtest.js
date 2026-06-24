import express from 'express';
import { getRegimeSegments } from '../services/marketRegime.js';
import { replayStrategyOnCandles, computeMetrics } from '../services/backtestEngine.js';

const router = express.Router();

const STARTING_BALANCE_FOR_BACKTEST = 10000; // matches paperWallet.js's real starting balance

const REGIME_LABELS = {
  bull: 'Bull market',
  bear: 'Bear market',
  sideways: 'Sideways / ranging',
  high_volatility: 'High volatility',
  unknown: 'Unclassified',
};

/**
 * Decide whether a strategy is robust across regimes or just got lucky in
 * one. This is the actual point of multi-regime testing -- a strategy that
 * is strongly profitable in exactly one regime and loses money in every
 * other regime it was tested against should be flagged, not silently
 * averaged into a single number that looks fine overall.
 */
const buildRobustnessVerdict = (regimeResults) => {
  const tested = regimeResults.filter((r) => r.metrics.totalTrades > 0);
  if (tested.length === 0) {
    return { robustnessScore: 0, verdict: 'Not enough historical data to test this strategy.' };
  }

  const profitableRegimes = tested.filter((r) => r.metrics.totalReturn > 0);
  const losingRegimes = tested.filter((r) => r.metrics.totalReturn <= 0);

  const robustnessScore = Math.round((profitableRegimes.length / tested.length) * 100);

  let verdict;
  if (tested.length === 1) {
    verdict = `Only one usable regime was found in the available history -- treat this result as preliminary, not a robustness guarantee.`;
  } else if (profitableRegimes.length === tested.length) {
    verdict = `Profitable across all ${tested.length} tested regimes (${tested.map((r) => REGIME_LABELS[r.label]).join(', ')}). This is a genuinely encouraging sign of robustness.`;
  } else if (profitableRegimes.length === 0) {
    verdict = `Unprofitable across every tested regime. This strategy's current parameters do not appear to have a real edge.`;
  } else {
    verdict = `Profitable in ${profitableRegimes.map((r) => REGIME_LABELS[r.label]).join(', ')} but lost money in ${losingRegimes.map((r) => REGIME_LABELS[r.label]).join(', ')}. This strategy is regime-dependent -- it is not safe to assume it will perform the same way regardless of market conditions.`;
  }

  return { robustnessScore, verdict };
};

// POST /api/backtest/run
// Replaces a strategy's claims with a real, multi-regime historical replay.
router.post('/run', async (req, res) => {
  const {
    strategy, asset, timeframe, side, entryType, entryPrice,
    stopLoss, takeProfit, positionSize, leverage,
  } = req.body;

  if (!asset || !stopLoss || !takeProfit || !positionSize) {
    return res.status(400).json({
      error: 'Missing required fields for backtest: asset, stopLoss, takeProfit, and positionSize are required.',
    });
  }

  try {
    const segments = await getRegimeSegments(asset, timeframe || '1h', 5);

    if (segments.length === 0) {
      return res.status(502).json({
        error: `Could not fetch historical data for ${asset} -- Bitget may not list this pair, or historical candles are unavailable.`,
      });
    }

    const strategyConfig = {
      side: side === 'short' ? 'short' : 'long',
      entryType: entryType || 'market',
      entryPrice: entryPrice ? parseFloat(entryPrice) : null,
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      positionSizePercent: parseFloat(positionSize),
      leverage: leverage && leverage > 1 ? parseFloat(leverage) : 1,
    };

    const regimeResults = segments.map((segment) => {
      const { trades, endingBalance } = replayStrategyOnCandles(
        strategyConfig, segment.candles, STARTING_BALANCE_FOR_BACKTEST
      );
      const metrics = computeMetrics(trades, STARTING_BALANCE_FOR_BACKTEST);
      return {
        label: segment.label,
        labelDisplay: REGIME_LABELS[segment.label] || segment.label,
        regimeStats: segment.stats,
        metrics,
        fullTrades: trades, // kept for aggregate metrics below, stripped before responding
        trades: trades.slice(-10), // last 10 trades per regime in the actual response, enough to inspect without bloating the payload
        endingBalance: parseFloat(endingBalance.toFixed(2)),
      };
    });

    const { robustnessScore, verdict } = buildRobustnessVerdict(regimeResults);

    // Aggregate metrics across all regimes combined, computed from the full
    // (non-truncated) trade lists captured above -- no need to replay twice.
    const allTrades = regimeResults.flatMap((r) => r.fullTrades);
    const aggregateMetrics = computeMetrics(allTrades, STARTING_BALANCE_FOR_BACKTEST);

    // Strip fullTrades before sending -- it was only needed for the
    // aggregate calculation above, not for the client payload.
    const responseRegimes = regimeResults.map(({ fullTrades, ...rest }) => rest);

    res.json({
      strategyName: strategy?.split('\n')[0]?.replace('STRATEGY NAME:', '').trim() || 'Custom Strategy',
      asset,
      timeframe: timeframe || '1h',
      startingBalance: STARTING_BALANCE_FOR_BACKTEST,
      aggregateMetrics,
      robustnessScore,
      verdict,
      regimes: responseRegimes,
    });
  } catch (error) {
    console.error('Backtest error:', error.message);
    res.status(500).json({ error: 'Backtest failed' });
  }
});

export default router;