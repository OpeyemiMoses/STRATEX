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

router.post('/run', async (req, res) => {
  const { strategy, asset, timeframe, stopLoss, takeProfit, positionSize } = req.body;

  try {
    // Simulate backtest results while Playbook API is being integrated
    const mockResults = {
      strategyName: strategy?.split('\n')[0]?.replace('STRATEGY NAME:', '').trim() || 'Custom Strategy',
      asset,
      timeframe,
      period: 'Jan 1, 2024 – Jun 1, 2024',
      metrics: {
        totalReturn: +(Math.random() * 60 - 10).toFixed(2),
        sharpeRatio: +(Math.random() * 2 + 0.5).toFixed(2),
        winRate: +(Math.random() * 30 + 45).toFixed(1),
        maxDrawdown: -(Math.random() * 15 + 2).toFixed(2),
        totalTrades: Math.floor(Math.random() * 300 + 50),
        profitFactor: +(Math.random() * 1.5 + 1).toFixed(2),
      },
      trades: Array.from({ length: 8 }, (_, i) => {
        const pnl = +(Math.random() * 1200 - 200).toFixed(2);
        return {
          id: i + 1,
          type: Math.random() > 0.5 ? 'Long' : 'Short',
          entry: (60000 + Math.random() * 5000).toFixed(1),
          exit: (60000 + Math.random() * 5000).toFixed(1),
          pnl,
          pnlPct: +(pnl / 1000).toFixed(2),
          time: new Date(Date.now() - i * 86400000).toLocaleDateString(),
        };
      }),
      chartData: Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        value: 100 + Math.sin(i * 0.3) * 10 + i * 1.5 + Math.random() * 5,
      })),
    };

    res.json(mockResults);

  } catch (error) {
    console.error('Backtest error:', error.message);
    res.status(500).json({ error: 'Backtest failed' });
  }
});

export default router;