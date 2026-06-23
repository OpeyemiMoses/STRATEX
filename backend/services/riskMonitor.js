import axios from 'axios';
import { logDecision } from './decisionLog.js';

const QWEN_BASE_URL = process.env.QWEN_BASE_URL;
const QWEN_API_KEY = process.env.QWEN_API_KEY;

// Re-evaluate SL/TP when price has moved this % from the last time we checked
// (not from entry — a rolling trigger so it fires on real moves, not just once).
const REEVALUATION_THRESHOLD_PERCENT = 1.5;

/**
 * Decide whether a bot's open position has moved enough since its last
 * evaluation to justify spending a Qwen call on re-assessing SL/TP.
 */
export const shouldReevaluate = (bot, currentPrice) => {
  if (!bot.lastEvaluatedPrice) return true; // never evaluated yet — do it once on first open
  const movePercent = Math.abs((currentPrice - bot.lastEvaluatedPrice) / bot.lastEvaluatedPrice) * 100;
  return movePercent >= REEVALUATION_THRESHOLD_PERCENT;
};

/**
 * Ask Qwen whether the current SL/TP still make sense given the move, and
 * apply + log any change. Mutates `bot` in place (caller is responsible for
 * saving/persisting afterward, same pattern as the rest of simulator.js).
 */
export const reevaluatePosition = async (bot, currentPrice) => {
  const priorPrice = bot.lastEvaluatedPrice || bot.filledEntry;
  const movePercent = ((currentPrice - priorPrice) / priorPrice) * 100;

  let assessment;
  try {
    const prompt = `A ${bot.side} position on ${bot.asset} was entered at ${bot.filledEntry}.
Current price: ${currentPrice} (moved ${movePercent.toFixed(2)}% since last check at ${priorPrice}).
Current stop-loss: ${bot.stopLoss}, current take-profit: ${bot.takeProfit}.

Given this price move, should the stop-loss and/or take-profit be adjusted to better protect profit or limit risk?
Respond ONLY in JSON, no preamble, no markdown:
{
  "shouldAdjust": boolean,
  "newStopLoss": number or null (null if no change),
  "newTakeProfit": number or null (null if no change),
  "reasoning": "one or two plain-English sentences explaining the decision, for display to the end user"
}`;

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
    assessment = JSON.parse(cleaned);
  } catch (err) {
    console.error(`[RISK-MONITOR] Qwen call failed for ${bot.name}:`, err.message);
    // Log the failure too — silent failures here would be invisible in the console (#5)
    logDecision({
      type: 'risk_assessment',
      botId: bot.id,
      walletAddress: bot.walletAddress,
      reasoning: `Risk re-evaluation failed (${err.message}) — SL/TP left unchanged.`,
      data: { currentPrice, movePercent, error: err.message },
      severity: 'warning',
    });
    bot.lastEvaluatedPrice = currentPrice;
    return;
  }

  // Always log the reasoning step, whether or not it resulted in a change (#13)
  logDecision({
    type: 'risk_assessment',
    botId: bot.id,
    walletAddress: bot.walletAddress,
    reasoning: assessment.reasoning || 'No reasoning provided.',
    data: {
      currentPrice,
      movePercent: parseFloat(movePercent.toFixed(2)),
      priorStopLoss: bot.stopLoss,
      priorTakeProfit: bot.takeProfit,
      proposedStopLoss: assessment.newStopLoss,
      proposedTakeProfit: assessment.newTakeProfit,
      shouldAdjust: !!assessment.shouldAdjust,
    },
    severity: 'info',
  });

  if (assessment.shouldAdjust) {
    const oldSL = bot.stopLoss;
    const oldTP = bot.takeProfit;

    if (assessment.newStopLoss !== null && assessment.newStopLoss !== undefined) {
      bot.stopLoss = assessment.newStopLoss;
    }
    if (assessment.newTakeProfit !== null && assessment.newTakeProfit !== undefined) {
      bot.takeProfit = assessment.newTakeProfit;
    }

    bot.slTpAdjustmentHistory = bot.slTpAdjustmentHistory || [];
    bot.slTpAdjustmentHistory.push({
      timestamp: new Date().toISOString(),
      price: currentPrice,
      oldStopLoss: oldSL,
      newStopLoss: bot.stopLoss,
      oldTakeProfit: oldTP,
      newTakeProfit: bot.takeProfit,
      reasoning: assessment.reasoning,
    });

    // Separate, clearly-typed log entry specifically for the adjustment itself (#8),
    // distinct from the general risk_assessment entry above.
    logDecision({
      type: 'sl_tp_adjustment',
      botId: bot.id,
      walletAddress: bot.walletAddress,
      reasoning: assessment.reasoning || 'SL/TP adjusted based on price movement.',
      data: {
        oldStopLoss: oldSL,
        newStopLoss: bot.stopLoss,
        oldTakeProfit: oldTP,
        newTakeProfit: bot.takeProfit,
        priceAtAdjustment: currentPrice,
      },
      severity: 'info',
    });

    console.log(`[RISK-MONITOR] ${bot.name} SL/TP adjusted: SL ${oldSL}→${bot.stopLoss}, TP ${oldTP}→${bot.takeProfit}`);
  }

  bot.lastEvaluatedPrice = currentPrice;
};