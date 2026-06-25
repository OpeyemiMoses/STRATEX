import express from 'express';
import axios from 'axios';

const router = express.Router();

const BITGET = axios.create({
  baseURL: 'https://api.bitget.com',
});

const WATCH_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'AVAXUSDT', 'DOGEUSDT', 'ADAUSDT', 'MATICUSDT', 'SHIBUSDT',
];

const WHALE_THRESHOLD_USD = 500_000;
const PRODUCT_TYPE = 'USDT-FUTURES';

let eventsCache = null;
let eventsCacheTime = 0;

const getWhaleEvents = async () => {
  if (eventsCache && Date.now() - eventsCacheTime < 60000) return eventsCache;

  const allTrades = [];


  await Promise.allSettled(
    WATCH_SYMBOLS.map(async (symbol) => {
      try {
        const { data } = await BITGET.get('/api/v2/mix/market/fills', {
          params: { symbol, limit: 100, productType: PRODUCT_TYPE },
        });
        if (data.code !== '00000' || !Array.isArray(data.data)) return;

        const fills = data.data;
        if (!fills.length) return;

        const base = symbol.replace(/USDT$/, '');

        for (const fill of fills) {
          const price = parseFloat(fill.price);
          const size = parseFloat(fill.size);
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
        // Silently skip failed symbols — don't crash the whole response
      }
    })
  );

  allTrades.sort((a, b) => b.usdValue - a.usdValue);
  const top = allTrades.slice(0, 10);

  const events = top.map((t, i) => {
    const isBuy = t.side === 'buy';
    const usdFormatted = t.usdValue >= 1_000_000
      ? `$${(t.usdValue / 1_000_000).toFixed(1)}M`
      : `$${(t.usdValue / 1_000).toFixed(0)}K`;

    const sizeFormatted = t.size >= 1_000_000
      ? `${(t.size / 1_000_000).toFixed(2)}M`
      : t.size >= 1_000
      ? `${(t.size / 1_000).toFixed(1)}K`
      : t.size.toFixed(2);

    const minutesAgo = Math.round((Date.now() - t.timestamp) / 60000);
    const timeLabel = minutesAgo < 1
      ? 'Just now'
      : minutesAgo === 1
      ? '1 min ago'
      : `${minutesAgo} mins ago`;

    return {
      id: i + 1,
      tradeId: t.tradeId,
      time: timeLabel,
      type: 'trade',
      amount: sizeFormatted,
      symbol: t.base,
      amountUsd: usdFormatted,
      from: isBuy ? 'Market' : 'Holder',
      to: isBuy ? 'Buyer' : 'Exchange',
      tag: isBuy ? 'Bullish' : 'Bearish',
      tagColor: isBuy ? '#00D68F' : '#FF4D6A',
      icon: '🐋',
      side: t.side,
      price: t.price,
    };
  });

  eventsCache = events.length > 0 ? events : [];
  eventsCacheTime = Date.now();
  return eventsCache;
};

router.get('/events', async (req, res) => {
  try {
    const events = await getWhaleEvents();
    res.json(events);
  } catch (error) {
    console.error('Whale events error:', error.message);
    res.status(500).json({ error: 'Failed to fetch whale events' });
  }
});

export default router;