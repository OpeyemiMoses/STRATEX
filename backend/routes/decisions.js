import express from 'express';
import { getRecentDecisions, getBotDecisionHistory } from '../services/decisionLog.js';

const router = express.Router();


router.get('/recent', (req, res) => {
  const { limit, type, wallet, since } = req.query;
  const entries = getRecentDecisions({
    limit: limit ? parseInt(limit, 10) : 50,
    type,
    walletAddress: wallet,
    since,
  });
  res.json(entries);
});


router.get('/bot/:botId', (req, res) => {
  const entries = getBotDecisionHistory(req.params.botId);
  res.json(entries);
});

export default router;