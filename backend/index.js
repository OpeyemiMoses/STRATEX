import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import strategyRoutes from './routes/strategy.js';
import backtestRoutes from './routes/backtest.js';
import botRoutes, { getBots, setBots } from './routes/bots.js';
import { initSimulator } from './services/simulator.js';
import signalRoutes from './routes/signals.js';
import coingeckoRoutes from './routes/coingecko.js';
import whaleRoutes from './routes/whale.js';
import walletRoutes from './routes/wallet.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/strategy', strategyRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/coingecko', coingeckoRoutes);
app.use('/api/whale', whaleRoutes);
app.use('/api/wallet', walletRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Stratex API' }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initSimulator(getBots, setBots);
});