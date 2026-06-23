import express from 'express';
import { getRecentDecisions, getBotDecisionHistory } from '../services/decisionLog.js';

const router = express.Router();

// GET /api/decisions/recent?limit=50&type=sl_tp_adjustment&wallet=0x...&since=ISO_TIMESTAMP
// Used by the floating console (#5) to poll for new entries.
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

// GET /api/decisions/bot/:botId
// Full reasoning history for a single bot, oldest first — used by bot auditing (#12)
// and the bot detail page if you want to show "why did this happen" inline.
router.get('/bot/:botId', (req, res) => {
  const entries = getBotDecisionHistory(req.params.botId);
  res.json(entries);
});

export default router;