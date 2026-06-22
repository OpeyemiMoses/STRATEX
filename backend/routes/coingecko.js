import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const CG = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  headers: {
    'x-cg-demo-api-key': process.env.COINGECKO_API_KEY,
  },
});

const BITGET = axios.create({
  baseURL: 'https://api.bitget.com',
});

// ─── CoinGecko routes (kept — Bitget has no equivalent) ───────────────────────

// Top searches
router.get('/trending', async (req, res) => {
  try {
    const { data } = await CG.get('/search/trending');
    const coins = data.coins.map(c => ({
      id: c.item.id,
      name: c.item.name,
      symbol: c.item.symbol,
      rank: c.item.market_cap_rank,
      thumb: c.item.thumb,
      small: c.item.small,
      priceBtc: c.item.price_btc,
      data: c.item.data,
    }));
    res.json(coins);
  } catch (error) {
    console.error('CoinGecko trending error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trending' });
  }
});

// Single coin detail for analysis (still CoinGecko — richer data than Bitget)
router.get('/coin/:id', async (req, res) => {
  try {
    const { data } = await CG.get(`/coins/${req.params.id}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: true,
        developer_data: false,
        sparkline: true,
      },
    });
    res.json({
      id: data.id,
      name: data.name,
      symbol: data.symbol,
      image: data.image,
      price: data.market_data.current_price.usd,
      change24h: data.market_data.price_change_percentage_24h,
      change7d: data.market_data.price_change_percentage_7d,
      change30d: data.market_data.price_change_percentage_30d,
      marketCap: data.market_data.market_cap.usd,
      volume24h: data.market_data.total_volume.usd,
      high24h: data.market_data.high_24h.usd,
      low24h: data.market_data.low_24h.usd,
      ath: data.market_data.ath.usd,
      athChange: data.market_data.ath_change_percentage.usd,
      circulatingSupply: data.market_data.circulating_supply,
      totalSupply: data.market_data.total_supply,
      sparkline: data.market_data.sparkline_7d,
      sentiment: {
        up: data.sentiment_votes_up_percentage,
        down: data.sentiment_votes_down_percentage,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coin detail' });
  }
});

// Icon lookup — kept on CoinGecko (Bitget has no icon API)
const iconCache = new Map();

router.get('/icon/:symbol', async (req, res) => {
  const symbol = req.params.symbol.replace(/USDT$/i, '').toLowerCase();

  if (iconCache.has(symbol)) {
    return res.json({ image: iconCache.get(symbol) });
  }

  try {
    const { data } = await CG.get('/search', { params: { query: symbol } });
    const match = data.coins?.find(c => c.symbol.toLowerCase() === symbol) || data.coins?.[0];
    const image = match?.large || match?.thumb || null;

    if (image) iconCache.set(symbol, image);
    res.json({ image });
  } catch (error) {
    console.error('CoinGecko icon lookup error:', error.message);
    res.json({ image: null });
  }
});

// ─── Bitget-powered market routes ─────────────────────────────────────────────

// Helper: fetch all USDT spot tickers from Bitget and normalise them
const fetchBitgetTickers = async () => {
  const { data } = await BITGET.get('/api/v2/spot/market/tickers');
  if (data.code !== '00000') throw new Error('Bitget tickers error: ' + data.msg);

  return data.data
    .filter(t => t.symbol.endsWith('USDT'))
    .map(t => ({
      symbol: t.symbol,                                        // e.g. BTCUSDT
      base: t.symbol.replace(/USDT$/, ''),                     // e.g. BTC
      price: parseFloat(t.lastPr),
      change24h: parseFloat(t.change24h) * 100,               // Bitget returns 0.0x decimal
      high24h: parseFloat(t.high24h),
      low24h: parseFloat(t.low24h),
      volume24h: parseFloat(t.quoteVolume),                   // quote vol = USD volume
      openUtc: parseFloat(t.openUtc),
    }))
    .filter(t => t.price > 0 && t.volume24h > 0);
};

// Known meme coins on Bitget
const MEME_SYMBOLS = [
  'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT', 'BONKUSDT',
  'WIFUSDT', 'MEMEUSDT', 'MOGUSDT', 'BRETTUSDT', 'NEIROUSDT',
];

// Known L1s on Bitget
const L1_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AVAXUSDT',
  'ADAUSDT', 'DOTUSDT', 'NEARUSDT', 'APTUSDT', 'SUIUSDT',
];

// Known L2s on Bitget
const L2_SYMBOLS = [
  'MATICUSDT', 'OPUSDT', 'ARBUSDT', 'STRKUSDT', 'SCROLLUSDT',
  'METISUSDT', 'MANTAUSDT', 'ZKUSDT', 'LINEAUSDT', 'BLASTUSDT',
];

const formatForFrontend = (ticker) => ({
  symbol: ticker.symbol,
  name: ticker.base,
  current_price: ticker.price,
  price_change_percentage_24h: ticker.change24h,
  high_24h: ticker.high24h,
  low_24h: ticker.low24h,
  total_volume: ticker.volume24h,
  // Sparkline not available from Bitget tickers — send empty so frontend degrades gracefully
  sparkline_in_7d: { price: [] },
  // image fetched client-side via /api/coingecko/icon/:symbol
  image: null,
});

// Cache tickers for 30s to avoid hammering Bitget on every tab switch
let tickerCache = null;
let tickerCacheTime = 0;

const getCachedTickers = async () => {
  if (tickerCache && Date.now() - tickerCacheTime < 30000) return tickerCache;
  tickerCache = await fetchBitgetTickers();
  tickerCacheTime = Date.now();
  return tickerCache;
};

// Meme coins — now from Bitget
router.get('/memes', async (req, res) => {
  try {
    const tickers = await getCachedTickers();
    const memes = tickers
      .filter(t => MEME_SYMBOLS.includes(t.symbol))
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 10)
      .map(formatForFrontend);
    res.json(memes);
  } catch (error) {
    console.error('Bitget memes error:', error.message);
    res.status(500).json({ error: 'Failed to fetch meme coins' });
  }
});

// L1 coins — now from Bitget
router.get('/l1', async (req, res) => {
  try {
    const tickers = await getCachedTickers();
    const l1s = tickers
      .filter(t => L1_SYMBOLS.includes(t.symbol))
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 10)
      .map(formatForFrontend);
    res.json(l1s);
  } catch (error) {
    console.error('Bitget L1 error:', error.message);
    res.status(500).json({ error: 'Failed to fetch L1 coins' });
  }
});

// L2 coins — now from Bitget
router.get('/l2', async (req, res) => {
  try {
    const tickers = await getCachedTickers();
    const l2s = tickers
      .filter(t => L2_SYMBOLS.includes(t.symbol))
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 10)
      .map(formatForFrontend);
    res.json(l2s);
  } catch (error) {
    console.error('Bitget L2 error:', error.message);
    res.status(500).json({ error: 'Failed to fetch L2 coins' });
  }
});

// General markets endpoint (kept for backward compat — uses Bitget top by volume)
router.get('/markets', async (req, res) => {
  try {
    const tickers = await getCachedTickers();
    const top = tickers
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 20)
      .map(formatForFrontend);
    res.json(top);
  } catch (error) {
    console.error('Bitget markets error:', error.message);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

export default router;