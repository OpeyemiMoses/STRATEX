import express from 'express';
import { getRecentDecisions, getBotDecisionHistory, clearWalletDecisions } from '../services/decisionLog.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_FILE = path.join(__dirname, '../data/bots.json');

const router = express.Router();

const getActiveBotIds = () => {
  try {
    if (!existsSync(BOTS_FILE)) return null;
    const bots = JSON.parse(readFileSync(BOTS_FILE, 'utf-8'));
    return new Set(bots.filter(b => b.status === 'active').map(b => b.id));
  } catch {
    return null;
  }
};

router.get('/recent', (req, res) => {
  const { limit, type, wallet, since } = req.query;

  let entries = getRecentDecisions({
    limit: limit ? parseInt(limit, 10) : 50,
    type,
    walletAddress: wallet,
    since,
  });

  const activeBotIds = getActiveBotIds();
  if (activeBotIds) {
    entries = entries.filter(e => !e.botId || activeBotIds.has(e.botId));
  }

  res.json(entries);
});


router.get('/bot/:botId', (req, res) => {
  const entries = getBotDecisionHistory(req.params.botId);
  res.json(entries);
});

router.delete('/clear', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  clearWalletDecisions(wallet);
  res.json({ ok: true });
});

export default router;