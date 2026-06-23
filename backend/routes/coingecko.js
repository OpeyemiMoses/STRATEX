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

// Market overview - all categories
router.get('/markets', async (req, res) => {
  const { category = '', page = 1 } = req.query;
  try {
    const params = {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 20,
      page,
      sparkline: true,
      price_change_percentage: '24h,7d',
    };
    if (category) params.category = category;

    const { data } = await CG.get('/coins/markets', { params });
    res.json(data);
  } catch (error) {
    console.error('CoinGecko markets error:', error.message);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

// Meme coins
router.get('/memes', async (req, res) => {
  try {
    const { data } = await CG.get('/coins/markets', {
      params: {
        vs_currency: 'usd',
        category: 'meme-token',
        order: 'market_cap_desc',
        per_page: 10,
        page: 1,
        sparkline: true,
        price_change_percentage: '24h',
      },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch memes' });
  }
});

// L1 coins
router.get('/l1', async (req, res) => {
  try {
    const { data } = await CG.get('/coins/markets', {
      params: {
        vs_currency: 'usd',
        category: 'layer-1',
        order: 'market_cap_desc',
        per_page: 10,
        page: 1,
        sparkline: true,
        price_change_percentage: '24h',
      },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch L1s' });
  }
});

// L2 coins
router.get('/l2', async (req, res) => {
  try {
    const { data } = await CG.get('/coins/markets', {
      params: {
        vs_currency: 'usd',
        category: 'layer-2',
        order: 'market_cap_desc',
        per_page: 10,
        page: 1,
        sparkline: true,
        price_change_percentage: '24h',
      },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch L2s' });
  }
});

// Single coin detail for analysis
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

// Icon lookup by Bitget-style symbol (e.g. DOGEUSDT -> doge icon)
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

export default router;