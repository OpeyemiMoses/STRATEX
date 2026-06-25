import axios from 'axios';
import { fetchHistoricalCandles } from './marketRegime.js';

const RECENT_WINDOW_CANDLES = 48;
const FUNDING_TICKER_URL = 'https://api.bitget.com/api/v2/mix/market/ticker';
const PRODUCT_TYPE = 'USDT-FUTURES';
const ELEVATED_FUNDING_THRESHOLD = 0.0005;

const fetchFundingRate = async (symbol) => {
  try {
    const res = await axios.get(FUNDING_TICKER_URL, {
      params: { symbol, productType: PRODUCT_TYPE },
    });
    const ticker = res.data?.data?.[0];
    const rate = ticker ? parseFloat(ticker.fundingRate) : null;
    return rate !== null && !isNaN(rate) ? rate : null;
  } catch (err) {
    console.error(`fetchFundingRate failed for ${symbol}:`, err.message);
    return null;
  }
};

export const getCurrentMarketState = async (symbol, timeframe = '1h') => {
  const [candles, fundingRate] = await Promise.all([
    fetchHistoricalCandles(symbol, timeframe, RECENT_WINDOW_CANDLES),
    fetchFundingRate(symbol),
  ]);
  if (candles.length < 10) return null;

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
  const annualizedVolPercent = stdDev * Math.sqrt(365 * 24) * 100;

  let peak = closes[0];
  let maxDrawdownPercent = 0;
  for (const price of closes) {
    if (price > peak) peak = price;
    const drawdown = ((price - peak) / peak) * 100;
    if (drawdown < maxDrawdownPercent) maxDrawdownPercent = drawdown;
  }

  const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length;
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

  // Positive funding = longs pay shorts = market is crowded long.
  // Negative funding = shorts pay longs = market is crowded short.
  let fundingSignal = 'neutral';
  if (fundingRate !== null && Math.abs(fundingRate) >= ELEVATED_FUNDING_THRESHOLD) {
    fundingSignal = fundingRate > 0 ? 'crowded_long' : 'crowded_short';
  }

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
    fundingRate,     // raw decimal fraction, e.g. -0.0007; null if unavailable
    fundingSignal,   // 'neutral' | 'crowded_long' | 'crowded_short'
  };
};

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

  const side = strategy.side || (strategy.action === 'sell' ? 'short' : 'long');
  if (marketState.fundingSignal !== 'neutral') {
    const crowdedSameSide =
      (marketState.fundingSignal === 'crowded_long' && side === 'long') ||
      (marketState.fundingSignal === 'crowded_short' && side === 'short');
    if (crowdedSameSide) {
      return {
        mismatch: true,
        severity: 'mild',
        reason: `Funding rate on this pair is currently ${(marketState.fundingRate * 100).toFixed(3)}% per interval, indicating the market is crowded ${marketState.fundingSignal === 'crowded_long' ? 'long' : 'short'} -- the same side as this strategy. You'd be paying recurring funding to stay in the trade, and crowded positioning is statistically more exposed to a sharp squeeze if that crowd unwinds.`,
      };
    }
  }

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