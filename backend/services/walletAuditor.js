import axios from 'axios';
import { logDecision, getRecentDecisions } from './decisionLog.js';
import { getHistory } from './tradeHistory.js';

const QWEN_BASE_URL = process.env.QWEN_BASE_URL;
const QWEN_API_KEY = process.env.QWEN_API_KEY;

/**
 * Audit a wallet's full trading performance across ALL its trades (closed +
 * currently active), looking specifically for patterns that span multiple
 * trades — repeated mistakes on the same asset, ignored risk warnings,
 * consistent over-leveraging, etc. This is deliberately different from
 * running botAuditor.js per-bot and concatenating results: the value here is
 * cross-trade pattern detection that a single-bot view can't surface.
 *
 * @param {string} walletAddress
 * @param {Array} activeBots - currently open/active bots for this wallet
 *                              (caller passes this in — typically bots.filter(b => b.walletAddress === address))
 * @returns {Promise<Object>} { patterns, stats, overallAssessment }
 */
export const auditWallet = async (walletAddress, activeBots = []) => {
  const closedTrades = getHistory(walletAddress);
  const decisionHistory = getRecentDecisions({ walletAddress, limit: 500 });

  if (closedTrades.length === 0 && activeBots.length === 0) {
    return { patterns: [], stats: null, overallAssessment: 'No trading history yet for this wallet.' };
  }

  // Basic aggregate stats computed in JS (cheap, deterministic — no need to
  // make Qwen do arithmetic it might get wrong)
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter((t) => (t.finalPnl || 0) > 0).length;
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.finalPnl || 0), 0);
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const assetBreakdown = {};
  for (const trade of closedTrades) {
    if (!assetBreakdown[trade.asset]) assetBreakdown[trade.asset] = { trades: 0, pnl: 0, wins: 0 };
    assetBreakdown[trade.asset].trades += 1;
    assetBreakdown[trade.asset].pnl += trade.finalPnl || 0;
    if ((trade.finalPnl || 0) > 0) assetBreakdown[trade.asset].wins += 1;
  }

  const stats = { totalTrades, winRate: parseFloat(winRate.toFixed(2)), totalPnl: parseFloat(totalPnl.toFixed(2)), assetBreakdown };

  const prompt = `You are reviewing a trader's FULL history across all their trades, looking specifically for
PATTERNS THAT SPAN MULTIPLE TRADES — not issues isolated to one trade. Examples of what counts as a pattern:
repeated losses on the same asset or side, consistently ignoring the AI's safer-strategy suggestions, a habit
of over-leveraging, getting stopped out repeatedly on the same kind of setup, improving or worsening behavior
over time. A single bad trade is NOT a pattern — only flag something here if it recurs.

AGGREGATE STATS:
${JSON.stringify(stats, null, 2)}

CLOSED TRADES (most recent first):
${JSON.stringify(
  closedTrades.slice(0, 50).map((t) => ({
    asset: t.asset, side: t.side, strategy: t.strategy, finalPnl: t.finalPnl,
    finalPnlPercent: t.finalPnlPercent, closedAt: t.closedAt,
  })),
  null, 2
)}

CURRENTLY ACTIVE/OPEN POSITIONS:
${JSON.stringify(
  activeBots.map((b) => ({ asset: b.asset, side: b.side, strategy: b.strategy, leverage: b.leverage, status: b.status })),
  null, 2
)}

RISK/DECISION LOG HISTORY (includes every time the AI proposed a safer alternative or flagged risk):
${JSON.stringify(
  decisionHistory.slice(0, 100).map((d) => ({ type: d.type, reasoning: d.reasoning, botId: d.botId })),
  null, 2
)}

Respond ONLY in JSON, no preamble, no markdown:
{
  "patterns": [
    {
      "severity": "info" | "warning" | "critical",
      "pattern": "short title for the pattern",
      "reasoning": "2-3 sentences explaining the pattern, citing specific evidence from the data above",
      "affectedTrades": number (how many trades this pattern applies to)
    }
  ],
  "overallAssessment": "2-3 sentence summary of this trader's overall behavior and performance"
}

If you find no real recurring pattern, return an empty patterns array — do not invent a pattern from a single trade.`;

  let result;
  try {
    const res = await axios.post(
      `${QWEN_BASE_URL}/chat/completions`,
      { model: 'qwen3.6-plus', messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${QWEN_API_KEY}` } }
    );
    const raw = res.data?.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    result = JSON.parse(cleaned);
  } catch (err) {
    console.error(`[WALLET-AUDIT] Qwen call failed for ${walletAddress}:`, err.message);
    throw new Error('Wallet audit failed — could not reach Qwen.');
  }

  const patterns = result.patterns || [];

  for (const pattern of patterns) {
    logDecision({
      type: 'audit_flag',
      botId: null, // wallet-level, not tied to one bot
      walletAddress,
      reasoning: `[Wallet pattern] ${pattern.pattern}: ${pattern.reasoning}`,
      data: { pattern: pattern.pattern, affectedTrades: pattern.affectedTrades },
      severity: pattern.severity || 'info',
    });
  }

  logDecision({
    type: 'audit_flag',
    botId: null,
    walletAddress,
    reasoning: `Wallet audit complete: ${result.overallAssessment || 'No summary provided.'}`,
    data: { patternCount: patterns.length, isOverallSummary: true, stats },
    severity: 'info',
  });

  return { patterns, stats, overallAssessment: result.overallAssessment };
};