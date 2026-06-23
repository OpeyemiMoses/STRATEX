import axios from 'axios';
import { logDecision, getBotDecisionHistory } from './decisionLog.js';

const QWEN_BASE_URL = process.env.QWEN_BASE_URL;
const QWEN_API_KEY = process.env.QWEN_API_KEY;

/**
 * Ask Qwen to review a bot's full history (trade log + every risk/adjustment
 * decision made along the way) and flag anything it considers a mistake or
 * risk-management weakness. Writes each flag as an `audit_flag` entry in the
 * decision log, then returns the flags directly for immediate display.
 *
 * @param {Object} bot - the bot object (active from bots.json or archived from trade-history.json)
 * @returns {Promise<Array>} the audit flags that were raised
 */
export const auditBot = async (bot) => {
  const decisionHistory = getBotDecisionHistory(bot.id);

  const prompt = `You are reviewing a completed or in-progress trading bot's full history to identify mistakes,
risk-management weaknesses, or questionable decisions. Be specific and critical — this audit is only useful
if it catches real issues, not if it rubber-stamps everything as fine.

BOT CONFIG:
- Asset: ${bot.asset}, Side: ${bot.side}, Strategy: ${bot.strategy}
- Entry type: ${bot.entryType}, Entry price: ${bot.entryPrice ?? bot.filledEntry}
- Stop-loss: ${bot.stopLoss}, Take-profit: ${bot.takeProfit}
- Position size: ${bot.positionSize}% of wallet
- Status: ${bot.status}, Final P&L: ${bot.pnl ?? 'still open'} (${bot.pnlPercent ?? 'n/a'}%)

TRADE LOG:
${JSON.stringify(bot.tradelog || [], null, 2)}

RISK/ADJUSTMENT DECISION HISTORY (every time the system re-evaluated this position):
${JSON.stringify(decisionHistory.map((d) => ({ type: d.type, reasoning: d.reasoning, data: d.data })), null, 2)}

Respond ONLY in JSON, no preamble, no markdown:
{
  "flags": [
    {
      "severity": "info" | "warning" | "critical",
      "issue": "short title for the issue",
      "reasoning": "1-3 sentences explaining what went wrong or could have been better, in plain English"
    }
  ],
  "overallAssessment": "1-2 sentence summary of how well this bot was managed overall"
}

If you find no real issues, return an empty flags array rather than inventing minor nitpicks.`;

  let result;
  try {
    const res = await axios.post(
      `${QWEN_BASE_URL}/chat/completions`,
      {
        model: 'qwen3.6-plus',
        messages: [{ role: 'user', content: prompt }],
      },
      { headers: { Authorization: `Bearer ${QWEN_API_KEY}` } }
    );
    const raw = res.data?.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    result = JSON.parse(cleaned);
  } catch (err) {
    console.error(`[AUDIT] Qwen call failed for bot ${bot.id}:`, err.message);
    throw new Error('Audit failed — could not reach Qwen.');
  }

  const flags = result.flags || [];

  // Log each flag individually so it shows up in the console (#5) and persists
  for (const flag of flags) {
    logDecision({
      type: 'audit_flag',
      botId: bot.id,
      walletAddress: bot.walletAddress,
      reasoning: `${flag.issue}: ${flag.reasoning}`,
      data: { issue: flag.issue },
      severity: flag.severity || 'info',
    });
  }

  // Also log the overall assessment as a single info-level entry, even if no flags
  logDecision({
    type: 'audit_flag',
    botId: bot.id,
    walletAddress: bot.walletAddress,
    reasoning: `Audit complete: ${result.overallAssessment || 'No summary provided.'}`,
    data: { flagCount: flags.length, isOverallSummary: true },
    severity: 'info',
  });

  return { flags, overallAssessment: result.overallAssessment };
};