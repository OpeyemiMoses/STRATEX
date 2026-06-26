import axios from 'axios';
import { logDecision, getBotDecisionHistory } from './decisionLog.js';
import { getCurrentMarketState } from './marketState.js';

const QWEN_BASE_URL = process.env.QWEN_BASE_URL;
const QWEN_API_KEY = process.env.QWEN_API_KEY;

/**
 * Ask Qwen to review a bot's full history (trade log + every risk/adjustment
 * decision made along the way) and flag anything it considers a mistake or
 * risk-management weakness — grounded against REAL current market
 * conditions, not just the bot's own internal history in isolation.
 *
 * For OPEN positions, this also asks Qwen to assess what is likely to
 * happen to the trade given where the market actually is right now (a
 * forward-looking risk read), since there's still an outcome left to
 * predict. For CLOSED positions, the audit stays purely retrospective —
 * there's nothing left to forecast, so no forward-looking section is
 * requested or returned.
 *
 * Writes each flag as an `audit_flag` entry in the decision log, then
 * returns the flags directly for immediate display.
 *
 * @param {Object} bot - the bot object (active from bots.json or archived from trade-history.json)
 * @returns {Promise<Object>} { flags, overallAssessment, outlook }
 */
export const auditBot = async (bot) => {
  const decisionHistory = getBotDecisionHistory(bot.id);
  const isOpen = bot.status !== 'closed' && bot.position === 'open';

  let marketState = null;
  try {
    marketState = await getCurrentMarketState(bot.asset, bot.timeframe || '1h');
  } catch (err) {
    console.error(`[AUDIT] Market state fetch failed for ${bot.asset}:`, err.message);
  }

  const marketBlock = marketState ? `
REAL CURRENT MARKET CONDITIONS for ${bot.asset} (most recent ~48 hours, fetched live):
- Regime: ${marketState.regimeDisplay}
- Net price move (48h): ${marketState.stats.netChangePercent}%
- Annualized volatility: ${marketState.stats.annualizedVolPercent}%
- Liquidity: ${marketState.liquidityFlag === 'low' ? 'LOW — recent volume has dropped sharply' : 'normal'}
- Current price: ${marketState.currentPrice}` : `
No live market data was available for ${bot.asset} — base the audit on the bot's own history alone, and mention this limitation in your overall assessment.`;
  const effectiveEntryPrice = bot.filledEntry ?? bot.entryPrice;

  const baseline = bot.openedWith || null;
  const autoAdjustCount = bot.slTpAdjustmentHistory?.filter(h => h.source === 'ai_auto').length || 0;
  const userEditCount = bot.slTpAdjustmentHistory?.filter(h => h.source === 'user_edit').length || 0;
  const baselineBlock = baseline ? `
ORIGINALLY OPENED WITH (the actual filled position, locked in at entry — treat this as ground truth
for what this trade started as, regardless of anything adjusted since):
- Filled entry: ${baseline.filledEntry}
- Stop-loss: ${baseline.stopLoss}, Take-profit: ${baseline.takeProfit}
- Leverage: ${baseline.leverage}x, Position size: ${baseline.positionSize}%
${baseline.strategySource ? `- Strategy used: the trader's chosen ${baseline.strategySource.choice === 'safer' ? 'AI safer version' : "own version"}${baseline.strategySource.edited ? ' (manually edited before deployment)' : ' (deployed as-is, unedited)'}` : ''}
${autoAdjustCount > 0 || userEditCount > 0
    ? `Since opening, SL/TP has changed ${autoAdjustCount} time${autoAdjustCount === 1 ? '' : 's'} via AI auto-adjustment and ${userEditCount} time${userEditCount === 1 ? '' : 's'} via manual user edit. The current stop-loss/take-profit in the BOT CONFIG above reflect the LATEST state, not the original.`
    : 'SL/TP has not been adjusted since opening — current values in BOT CONFIG match the original.'}` : '';

  const outlookInstructions = isOpen ? `
This position is currently OPEN. In addition to the retrospective audit, use the real current market
conditions above to assess what is LIKELY TO HAPPEN to this trade if nothing changes — e.g. is price
trending toward the take-profit or the stop-loss given the current regime and recent move? Is the
current stop-loss/take-profit still well-placed for current volatility, or exposed to being stopped
out by normal noise, or unrealistic given the current trend? This is a forward-looking risk read, not
a guarantee — phrase it as a likely outcome given current conditions, not a certainty.` : `
This position is CLOSED. Do not provide any forward-looking prediction — there is nothing left to
forecast for a completed trade. Keep the audit fully retrospective.`;

  const prompt = `You are reviewing a trading bot's history to identify mistakes, risk-management weaknesses,
or questionable decisions, grounded against REAL current market data for this asset — not just the
bot's own past reasoning in isolation. Be specific and critical — this audit is only useful if it
catches real issues, not if it rubber-stamps everything as fine.

BOT CONFIG:
- Asset: ${bot.asset}, Side: ${bot.side}, Strategy: ${bot.strategy}
- Entry type: ${bot.entryType}, Entry price: ${effectiveEntryPrice}
- Leverage: ${bot.leverage || 1}x (FIXED for the life of this position — futures leverage cannot be
  changed once a position is open. If leverage was a poor choice, frame that as a lesson for how
  future bots should be configured, never as a change to propose for THIS bot.)
- Stop-loss: ${bot.stopLoss}, Take-profit: ${bot.takeProfit}
${bot.liquidationPrice ? `- Liquidation price: ${bot.liquidationPrice} (fixed by entry + leverage, cannot move)` : ''}
- Position size: ${bot.positionSize}% of wallet
- Status: ${bot.status}, Position: ${bot.position}, Final/Current P&L: ${bot.pnl ?? 'still open'} (${bot.pnlPercent ?? 'n/a'}%)
${baselineBlock}
${marketBlock}
${outlookInstructions}

TRADE LOG:
${JSON.stringify(bot.tradelog || [], null, 2)}

RISK/ADJUSTMENT DECISION HISTORY (every time the system re-evaluated this position, including any
autonomous SL/TP adjustments it made):
${JSON.stringify(decisionHistory.map((d) => ({ type: d.type, reasoning: d.reasoning, data: d.data })), null, 2)}

Respond ONLY in JSON, no preamble, no markdown:
{
  "flags": [
    {
      "severity": "info" | "warning" | "critical",
      "issue": "short title for the issue",
      "reasoning": "1-3 sentences explaining what went wrong or could have been better, in plain English. Never suggest changing leverage on this position — it is fixed."
    }
  ],
  "overallAssessment": "1-2 sentence summary of how well this bot was managed overall"${isOpen ? `,
  "outlook": {
    "likelyOutcome": "1-2 sentences on what is likely to happen to this open position given REAL current market conditions, phrased as a likely scenario, not a certainty",
    "currentRiskLevel": "low" | "medium" | "high",
    "suggestedAction": "1 sentence: e.g. hold as-is, consider tightening stop-loss, consider trailing take-profit, consider manual close — but NEVER suggest changing leverage"
  }` : ''}
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
  const outlook = isOpen ? (result.outlook || null) : null;
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

  logDecision({
    type: 'audit_flag',
    botId: bot.id,
    walletAddress: bot.walletAddress,
    reasoning: `Audit complete: ${result.overallAssessment || 'No summary provided.'}`,
    data: {
      flagCount: flags.length,
      isOverallSummary: true,
      marketRegime: marketState?.regime || null,
      outlook: outlook || undefined,
    },
    severity: 'info',
  });

  return { flags, overallAssessment: result.overallAssessment, outlook };
};