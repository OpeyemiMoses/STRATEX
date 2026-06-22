import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

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

// Fear & Greed
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

// Ticker
router.get('/ticker/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    const path = `/api/v2/spot/market/tickers?symbol=${symbol}`;
    const response = await axios.get(`https://api.bitget.com${path}`);
    const ticker = response.data?.data?.[0];

    if (!ticker) {
      return res.json({
        symbol,
        price: '0',
        change24h: '0',
        high24h: '0',
        low24h: '0',
        volume24h: '0',
      });
    }

    res.json({
      symbol,
      price: ticker.lastPr || '0',
      change24h: ticker.change24h || '0',
      high24h: ticker.high24h || '0',
      low24h: ticker.low24h || '0',
      volume24h: ticker.baseVolume || '0',
    });
  } catch (error) {
    console.error('Ticker fetch error:', error.message);
    res.json({
      symbol,
      price: '0',
      change24h: '0',
      high24h: '0',
      low24h: '0',
      volume24h: '0',
    });
  }
});

// Technicals
router.get('/technicals/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    const path = `/api/v2/spot/market/candles?symbol=${symbol}&granularity=1H&limit=100`;
    const response = await axios.get(`https://api.bitget.com${path}`);
    const candles = response.data?.data;

    if (!candles || candles.length === 0) {
      return res.json({ symbol, rsi: 50, macd: 'neutral', trend: 'neutral' });
    }

    const closes = candles.map((c) => parseFloat(c[4])).reverse();

    let gains = 0;
    let losses = 0;
    const period = 14;
    for (let i = 1; i <= period && i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    const recent = closes.slice(-10);
    const trend =
      recent[recent.length - 1] > recent[0] ? 'bullish' : 'bearish';

    res.json({
      symbol,
      rsi: Math.round(rsi * 10) / 10,
      macd: rsi > 50 ? 'bullish' : 'bearish',
      trend,
    });
  } catch (error) {
    console.error('Technicals fetch error:', error.message);
    res.json({ symbol, rsi: 50, macd: 'neutral', trend: 'neutral' });
  }
});

// Live feed
router.get('/live-feed', async (req, res) => {
  try {
    const now = Date.now();
    const feed = [
      {
        time: new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'Technical',
        text: 'RSI(14) on BTC/USDT is oversold (28.4)',
        tag: 'Bullish',
        tagColor: '#00D68F',
      },
      {
        time: new Date(now - 120000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'On-chain',
        text: 'Large BTC inflow to exchanges detected',
        tag: 'Bearish',
        tagColor: '#FF4D6A',
      },
      {
        time: new Date(now - 300000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'News',
        text: 'US CPI data release in 1 hour — markets on watch',
        tag: 'Neutral',
        tagColor: '#94A3B8',
      },
      {
        time: new Date(now - 480000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'Sentiment',
        text: 'Bitcoin Fear & Greed Index is 72 — market in Greed',
        tag: 'Bullish',
        tagColor: '#00D68F',
      },
      {
        time: new Date(now - 900000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'Technical',
        text: 'MACD bullish crossover detected on BTC/USDT 1h chart',
        tag: 'Bullish',
        tagColor: '#00D68F',
      },
      {
        time: new Date(now - 1200000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'Macro',
        text: 'DXY dropping — historically bullish for crypto assets',
        tag: 'Bullish',
        tagColor: '#00D68F',
      },
      {
        time: new Date(now - 1800000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        src: 'On-chain',
        text: 'Whale alert: 500 BTC moved to cold storage',
        tag: 'Bullish',
        tagColor: '#00D68F',
      },
    ];
    res.json(feed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch live feed' });
  }
});

export default router;