import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { getCurrentMarketState } from '../services/marketState.js';

dotenv.config();

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

// ─── Qwen with retry + detailed error logging ────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qwen = async (messages, systemPrompt, retries = 2) => {
  const url = `${process.env.QWEN_BASE_URL}/chat/completions`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        url,
        {
          model: 'qwen3.6-plus',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          max_tokens: 1500,
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      return response.data.choices[0].message.content;
    } catch (err) {
      const status = err?.response?.status;
      const data   = err?.response?.data;
      console.error(
        `[Qwen] attempt ${attempt + 1}/${retries + 1} failed —`,
        `status=${status}`,
        `url=${url}`,
        `body=${JSON.stringify(data)}`
      );
      // Don't retry on auth/bad-request errors — only on 503/502/429
      if (status && ![429, 502, 503].includes(status)) throw err;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`Qwen API unavailable after ${retries + 1} attempts`);
};
// ─────────────────────────────────────────────────────────────────────────────

const stripJsonFences = (raw) => {
  let clean = raw.replace(/```json|```/g, '').trim();
  const firstBrace   = clean.indexOf('{');
  const lastBrace    = clean.lastIndexOf('}');
  const firstBracket = clean.indexOf('[');
  const lastBracket  = clean.lastIndexOf(']');
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    if (lastBracket !== -1) return clean.slice(firstBracket, lastBracket + 1);
  }
  if (firstBrace !== -1 && lastBrace !== -1) {
    return clean.slice(firstBrace, lastBrace + 1);
  }
  return clean;
};

const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];
const WHALE_THRESHOLD_USD = 500_000;
const PRODUCT_TYPE = 'USDT-FUTURES';

// ── GET /api/signals/fear-greed ──────────────────────────────────────────────
router.get('/fear-greed', async (req, res) => {
  try {
    const response = await axios.get('https://api.alternative.me/fng/?limit=1');
    const data = response.data.data[0];
    res.json({
      value: parseInt(data.value),
      label: data.value_classification,
      timestamp: data.timestamp,
    });
  } catch (error) {
    res.json({ value: 72, label: 'Greed', timestamp: Date.now() });
  }
});

// ── GET /api/signals/ticker/:symbol ─────────────────────────────────────────
router.get('/ticker/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    const response = await axios.get('https://api.bitget.com/api/v2/mix/market/ticker', {
      params: { symbol, productType: PRODUCT_TYPE },
    });
    const ticker = response.data?.data?.[0];

    if (!ticker) {
      return res.json({ symbol, price: '0', change24h: '0', high24h: '0', low24h: '0', volume24h: '0' });
    }

    res.json({
      symbol,
      price:     ticker.lastPr    || '0',
      change24h: ticker.change24h || '0',
      high24h:   ticker.high24h   || '0',
      low24h:    ticker.low24h    || '0',
      volume24h: ticker.baseVolume || '0',
    });
  } catch (error) {
    console.error('Ticker fetch error:', error.message);
    res.json({ symbol, price: '0', change24h: '0', high24h: '0', low24h: '0', volume24h: '0' });
  }
});

// ── Technicals helper ────────────────────────────────────────────────────────
const computeTechnicals = async (symbol) => {
  const response = await axios.get('https://api.bitget.com/api/v2/mix/market/candles', {
    params: { symbol, granularity: '1h', limit: 100, productType: PRODUCT_TYPE },
  });
  const candles = response.data?.data;

  if (!candles || candles.length === 0) {
    return { symbol, rsi: 50, macd: 'neutral', trend: 'neutral' };
  }

  const closes = candles.map((c) => parseFloat(c[4])).reverse();

  let gains = 0, losses = 0;
  const period = 14;
  for (let i = 1; i <= period && i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs  = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  const recent = closes.slice(-10);
  const trend  = recent[recent.length - 1] > recent[0] ? 'bullish' : 'bearish';

  return {
    symbol,
    rsi:  Math.round(rsi * 10) / 10,
    macd: rsi > 50 ? 'bullish' : 'bearish',
    trend,
  };
};

// ── GET /api/signals/technicals/:symbol ─────────────────────────────────────
router.get('/technicals/:symbol', async (req, res) => {
  try {
    const result = await computeTechnicals(req.params.symbol);
    res.json(result);
  } catch (error) {
    console.error('Technicals fetch error:', error.message);
    res.json({ symbol: req.params.symbol, rsi: 50, macd: 'neutral', trend: 'neutral' });
  }
});

// ── Whale cache helper ───────────────────────────────────────────────────────
let whaleCache     = null;
let whaleCacheTime = 0;

const getWhaleEvents = async () => {
  if (whaleCache && Date.now() - whaleCacheTime < 60000) return whaleCache;

  const allTrades = [];

  await Promise.allSettled(
    WATCHLIST.map(async (symbol) => {
      try {
        const { data } = await axios.get('https://api.bitget.com/api/v2/mix/market/fills', {
          params: { symbol, limit: 100, productType: PRODUCT_TYPE },
        });
        if (data.code !== '00000' || !Array.isArray(data.data)) return;

        const fills = data.data;
        if (!fills.length) return;
        const base = symbol.replace(/USDT$/, '');

        for (const fill of fills) {
          const price    = parseFloat(fill.price);
          const size     = parseFloat(fill.size);
          const usdValue = price * size;
          if (usdValue < WHALE_THRESHOLD_USD) continue;

          allTrades.push({
            id: fill.tradeId,
            symbol,
            base,
            side: fill.side,
            price,
            size,
            usdValue,
            timestamp: parseInt(fill.ts),
          });
        }
      } catch (err) {
        // Skip failed symbols silently
      }
    })
  );

  allTrades.sort((a, b) => b.usdValue - a.usdValue);
  whaleCache     = allTrades.slice(0, 15);
  whaleCacheTime = Date.now();
  return whaleCache;
};

// ── GET /api/signals/live-feed ───────────────────────────────────────────────
router.get('/live-feed', async (req, res) => {
  try {
    const feed = [];

    const whales = await getWhaleEvents();
    for (const t of whales.slice(0, 4)) {
      const isBuy       = t.side === 'buy';
      const usdFormatted = t.usdValue >= 1_000_000
        ? `$${(t.usdValue / 1_000_000).toFixed(1)}M`
        : `$${(t.usdValue / 1_000).toFixed(0)}K`;
      feed.push({
        time: new Date(t.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        ts:   t.timestamp,
        src:  'On-chain',
        text: `${isBuy ? 'Large buy' : 'Large sell'} on ${t.base}/USDT: ${usdFormatted} at $${t.price}`,
        tag:      isBuy ? 'Bullish' : 'Bearish',
        tagColor: isBuy ? '#00D68F' : '#FF4D6A',
      });
    }

    const techResults = await Promise.allSettled(WATCHLIST.map((s) => computeTechnicals(s)));
    for (const r of techResults) {
      if (r.status !== 'fulfilled') continue;
      const t = r.value;
      if (t.rsi <= 30 || t.rsi >= 70) {
        const oversold = t.rsi <= 30;
        feed.push({
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          ts:   Date.now(),
          src:  'Technical',
          text: `RSI(14) on ${t.symbol} is ${oversold ? 'oversold' : 'overbought'} (${t.rsi})`,
          tag:      oversold ? 'Bullish' : 'Bearish',
          tagColor: oversold ? '#00D68F' : '#FF4D6A',
        });
      }
    }

    try {
      const fgRes = await axios.get('https://api.alternative.me/fng/?limit=1');
      const fg    = fgRes.data.data[0];
      feed.push({
        time: new Date(parseInt(fg.timestamp) * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        ts:   parseInt(fg.timestamp) * 1000,
        src:  'Sentiment',
        text: `Bitcoin Fear & Greed Index is ${fg.value} — market in ${fg.value_classification}`,
        tag:      parseInt(fg.value) >= 55 ? 'Bullish' : parseInt(fg.value) <= 45 ? 'Bearish' : 'Neutral',
        tagColor: parseInt(fg.value) >= 55 ? '#00D68F' : parseInt(fg.value) <= 45 ? '#FF4D6A' : '#94A3B8',
      });
    } catch (e) {
      // Skip sentiment if it fails
    }

    feed.sort((a, b) => b.ts - a.ts);
    res.json(feed.slice(0, 10).map(({ ts, ...rest }) => rest));
  } catch (error) {
    console.error('Live feed error:', error.message);
    res.status(500).json({ error: 'Failed to fetch live feed' });
  }
});

// ── POST /api/signals/market-analysis ───────────────────────────────────────
router.post('/market-analysis', async (req, res) => {
  const { asset } = req.body;
  const symbol    = asset || 'BTCUSDT';

  try {
    const [tickerRes, technicals, marketState] = await Promise.all([
      axios.get('https://api.bitget.com/api/v2/mix/market/ticker', {
        params: { symbol, productType: PRODUCT_TYPE },
      }).catch(() => null),
      computeTechnicals(symbol).catch(() => null),
      getCurrentMarketState(symbol, '1h').catch(() => null),
    ]);
    const ticker = tickerRes?.data?.data?.[0];

    const dataBlock = `
REAL CURRENT DATA for ${symbol} (fetched live from Bitget):
${ticker
  ? `- Price: $${ticker.lastPr}
- 24h change: ${(parseFloat(ticker.change24h) * 100).toFixed(2)}%
- 24h high/low: $${ticker.high24h} / $${ticker.low24h}
- 24h volume: ${ticker.baseVolume}`
  : '- Ticker unavailable'}
${technicals
  ? `- RSI (14, 1h): ${technicals.rsi}
- MACD signal: ${technicals.macd}
- Short-term trend: ${technicals.trend}`
  : '- Technicals unavailable'}
${marketState
  ? `- Market regime (last ~48h): ${marketState.regimeDisplay}
- Net price move (48h): ${marketState.stats.netChangePercent}%
- Annualized volatility: ${marketState.stats.annualizedVolPercent}%
- Liquidity: ${marketState.liquidityFlag}`
  : '- Extended market state unavailable'}`.trim();

    const system = `You are a crypto market analyst. You will be given REAL, live data fetched moments ago from Bitget for ${symbol} — use ONLY this data as your factual basis, do not invent prices, levels, or stats not present below. Give a concise market analysis grounded entirely in these real numbers: trend, key levels (referencing the actual 24h high/low given), and a trade signal (bullish/bearish/neutral) with brief reasoning tied to the RSI/trend/regime data provided. Max 150 words.`;

    const analysis = await qwen([{ role: 'user', content: dataBlock }], system);
    res.json({ analysis, data: { ticker: ticker || null, technicals, marketState } });
  } catch (err) {
    console.error('Market analysis FULL error:', err?.response?.status, JSON.stringify(err?.response?.data), err?.config?.url, err.message);
    res.status(500).json({ error: `Analysis error: ${err.message}` });
  }
});

// ── POST /api/signals/whale-analysis ────────────────────────────────────────
router.post('/whale-analysis', async (req, res) => {
  try {
    const whales = await getWhaleEvents();

    if (whales.length === 0) {
      return res.json({
        analysis: `No trades above the $${(WHALE_THRESHOLD_USD / 1000).toFixed(0)}K threshold were detected across the watchlist (${WATCHLIST.join(', ')}) in the most recent data pull. This suggests relatively quiet large-order activity right now.`,
        data: { whales: [] },
      });
    }

    const tradesSummary = whales.slice(0, 10).map((t) =>
      `${t.side.toUpperCase()} ${t.size.toFixed(4)} ${t.base} ($${(t.usdValue / 1000).toFixed(0)}K) at $${t.price}, ${Math.round((Date.now() - t.timestamp) / 60000)} min ago`
    ).join('\n');

    const system = `You are a crypto on-chain analyst specialising in whale activity. You will be given a list of REAL large trades (each over $${(WHALE_THRESHOLD_USD / 1000).toFixed(0)}K) fetched moments ago from Bitget's public trade feed across the watchlist (${WATCHLIST.join(', ')}). Summarise what these specific trades signal — e.g. whether buy-side or sell-side pressure dominates, which assets are seeing the heaviest large-order flow, and what that might mean short-term. Reference the actual assets and approximate sizes given. Do not invent trades not in the list. Max 150 words.`;

    const analysis = await qwen([{ role: 'user', content: tradesSummary }], system);
    res.json({ analysis, data: { whales: whales.slice(0, 10) } });
  } catch (err) {
    console.error('Whale analysis FULL error:', err?.response?.status, JSON.stringify(err?.response?.data), err?.config?.url, err.message);
    res.status(500).json({ error: `Whale analysis error: ${err.message}` });
  }
});

// ── POST /api/signals/trade-signals ─────────────────────────────────────────
router.post('/trade-signals', async (req, res) => {
  try {
    const scanResults = await Promise.allSettled(
      WATCHLIST.map(async (symbol) => {
        const [marketState, technicals, tickerRes] = await Promise.all([
          getCurrentMarketState(symbol, '1h'),
          computeTechnicals(symbol),
          axios.get('https://api.bitget.com/api/v2/mix/market/ticker', {
            params: { symbol, productType: PRODUCT_TYPE },
          }).catch(() => null),
        ]);
        const ticker = tickerRes?.data?.data?.[0];
        if (!marketState || !ticker) return null;
        return { symbol, marketState, technicals, currentPrice: parseFloat(ticker.lastPr) };
      })
    );

    const validScans = scanResults
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value);

    if (validScans.length === 0) {
      return res.json({ signals: [] });
    }

    const scanBlock = validScans.map((s) => `
${s.symbol}:
- Current price: $${s.currentPrice}
- Regime: ${s.marketState.regimeDisplay}
- Net change (48h): ${s.marketState.stats.netChangePercent}%
- Annualized volatility: ${s.marketState.stats.annualizedVolPercent}%
- Liquidity: ${s.marketState.liquidityFlag}
- RSI (14): ${s.technicals.rsi}
- MACD: ${s.technicals.macd}
- Trend: ${s.technicals.trend}`).join('\n');

    const system = `You are a professional crypto trading signal generator. You will be given REAL, live market data for ${validScans.length} assets, fetched moments ago from Bitget. For EACH asset, decide whether there is currently a tradeable opportunity (long or short) based ONLY on the real data given — do not invent data.

For assets with NO clear opportunity right now (e.g. choppy/sideways with no edge, or low liquidity), you may omit them entirely rather than forcing a signal.

For each asset you DO include, you must provide a complete, structured signal: a clear direction, a specific entry price, a take-profit price, a stop-loss price, a recommended leverage (1 if no leverage is warranted — recommend higher leverage only in lower-volatility regimes, and lower or no leverage when volatility is high or liquidity is low), a confidence score (0-100), and concise reasoning tied directly to the real numbers given (cite the actual RSI/regime/volatility values).

Take-profit and stop-loss MUST be consistent with the direction: for a long, take-profit is above entry and stop-loss is below entry; for a short, take-profit is below entry and stop-loss is above entry. Entry should be close to the current price given for that asset.

Return ONLY a valid JSON array, no markdown, no preamble. Each element:
{
  "symbol": "BTCUSDT",
  "side": "long" | "short",
  "entryPrice": number,
  "takeProfitPrice": number,
  "stopLossPrice": number,
  "leverage": number,
  "confidence": number,
  "reasoning": "1-2 sentences citing the actual data",
  "regime": "string, echo the regime given for this asset"
}

If NO asset currently has a tradeable opportunity, return an empty array: []`;

    const raw   = await qwen([{ role: 'user', content: scanBlock }], system);
    const clean = stripJsonFences(raw);
    let signals = JSON.parse(clean);

    if (!Array.isArray(signals)) signals = [];
    signals.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    res.json({ signals, scannedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Trade signals FULL error:', err?.response?.status, JSON.stringify(err?.response?.data), err?.config?.url, err.message);
    res.status(500).json({ error: `Trade signals error: ${err.message}` });
  }
});

export default router;