import axios from 'axios';

const BITGET_CANDLES_URL = 'https://api.bitget.com/api/v2/mix/market/candles';
const PRODUCT_TYPE = 'USDT-FUTURES';

const GRANULARITY_MAP = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  '4h': '4H',
  '6h': '6H',
  '12h': '12H',
  '1d': '1D',
  '1w': '1W',
  '1M': '1M',
};

export const fetchHistoricalCandles = async (
  symbol,
  timeframe = '1h',
  limit = 1000
) => {
  const granularity = GRANULARITY_MAP[timeframe] || '1H';

  try {
    const res = await axios.get(BITGET_CANDLES_URL, {
      params: {
        symbol,
        granularity,
        limit,
        productType: PRODUCT_TYPE,
      },
    });

    const raw = res.data?.data;
    if (!raw || raw.length === 0) return [];

    const candles = raw.map((c) => ({
      time: parseInt(c[0], 10),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5] ?? 0),
    }));

    candles.sort((a, b) => a.time - b.time);
    return candles;
  } catch (err) {
    const bitgetError = err.response?.data;

    console.error(
      `fetchHistoricalCandles (futures) failed for ${symbol} (granularity=${granularity}):`,
      bitgetError ? JSON.stringify(bitgetError) : err.message
    );

    return [];
  }
};


const computeSegmentStats = (candles) => {
  if (candles.length < 2) return null;

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
  const annualizedVolPercent = stdDev * Math.sqrt(365) * 100; // rough annualization for display

  const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length;


  let peak = closes[0];
  let maxDrawdownPercent = 0;
  for (const price of closes) {
    if (price > peak) peak = price;
    const drawdown = ((price - peak) / peak) * 100;
    if (drawdown < maxDrawdownPercent) maxDrawdownPercent = drawdown;
  }

  return { netChangePercent, annualizedVolPercent, avgVolume, maxDrawdownPercent };
};


const classifyRegime = (stats) => {
  if (!stats) return 'unknown';
  const { netChangePercent, annualizedVolPercent } = stats;

  if (annualizedVolPercent > 90) return 'high_volatility';
  if (netChangePercent > 8) return 'bull';
  if (netChangePercent < -8) return 'bear';
  return 'sideways';
};

/**
 * Fetch historical candles and split them into N roughly-equal segments,
 * each labeled with a regime based on its own computed stats. This is the
 * main export used by the backtest engine.
 *
 * @param {string} symbol
 * @param {string} timeframe
 * @param {number} segmentCount - how many regime windows to carve the history into
 * @returns {Promise<Array<{ label: string, stats: object, candles: Array }>>}
 */
export const getRegimeSegments = async (symbol, timeframe = '1h', segmentCount = 5) => {
  const candles = await fetchHistoricalCandles(symbol, timeframe, 1000);
  if (candles.length < segmentCount * 10) {
    // Not enough history to meaningfully split — return what we have as a
    // single segment rather than producing tiny, noisy slices.
    if (candles.length === 0) return [];
    const stats = computeSegmentStats(candles);
    return [{ label: classifyRegime(stats), stats, candles }];
  }

  const segmentSize = Math.floor(candles.length / segmentCount);
  const segments = [];
  for (let i = 0; i < segmentCount; i++) {
    const start = i * segmentSize;
    const end = i === segmentCount - 1 ? candles.length : start + segmentSize;
    const slice = candles.slice(start, end);
    const stats = computeSegmentStats(slice);
    segments.push({ label: classifyRegime(stats), stats, candles: slice });
  }
  return segments;
};