import axios from 'axios';
import { logDecision } from './decisionLog.js';
import { getCurrentMarketState } from './marketState.js';

const QWEN_BASE_URL = process.env.QWEN_BASE_URL;
const QWEN_API_KEY = process.env.QWEN_API_KEY;

const REEVALUATION_THRESHOLD_PERCENT = 1.5;

export const shouldReevaluate = (bot, currentPrice) => {
  if (!bot.lastEvaluatedPrice) return true;
  const movePercent = Math.abs((currentPrice - bot.lastEvaluatedPrice) / bot.lastEvaluatedPrice) * 100;
  return movePercent >= REEVALUATION_THRESHOLD_PERCENT;
};

export const reevaluatePosition = async (bot, currentPrice) => {
  const priorPrice = bot.lastEvaluatedPrice || bot.filledEntry;
  const movePercent = ((currentPrice - priorPrice) / priorPrice) * 100;
  const liveSide = bot.side || 'long';
  const hasUserEdits = bot.slTpAdjustmentHistory?.some(h => h.source === 'user_edit');
  const lastUserEdit = hasUserEdits
    ? bot.slTpAdjustmentHistory.filter(h => h.source === 'user_edit').at(-1)
    : null;

  let marketState = null;
  try {
    marketState = await getCurrentMarketState(bot.asset, bot.timeframe || '1h');
  } catch (err) {
    console.error(`[RISK-MONITOR] Market state fetch failed for ${bot.asset}:`, err.message);
  }

  let assessment;
  try {
    const prompt = `A ${liveSide.toUpperCase()} position on ${bot.asset} was entered at ${bot.filledEntry}, using ${bot.leverage || 1}x leverage (FIXED — leverage cannot be changed on an open futures position, do not propose changing it).
Current price: ${currentPrice} (moved ${movePercent.toFixed(2)}% since last check at ${priorPrice}).
Current stop-loss: ${bot.stopLoss}, current take-profit: ${bot.takeProfit}.
${bot.liquidationPrice ? `Liquidation price: ${bot.liquidationPrice} (fixed by entry + leverage, cannot move).` : ''}

IMPORTANT — POSITION SIDE: This is a ${liveSide.toUpperCase()} position.${liveSide !== (bot.originalAction === 'sell' ? 'short' : 'long') ? ' The AI risk analyser swapped the direction from the user\'s original intent before deployment — the current side is what matters, not the original.' : ''}
For a LONG: profit when price rises, loss when price falls. Stop-loss must be BELOW entry, take-profit must be ABOVE entry.
For a SHORT: profit when price falls, loss when price rises. Stop-loss must be ABOVE entry, take-profit must be BELOW entry.
Any suggested adjustments MUST respect this direction — do not propose a stop-loss above entry for a long, or below entry for a short.

${hasUserEdits ? `USER-EDITED LEVELS: The trader manually adjusted SL/TP on ${new Date(lastUserEdit.timestamp).toLocaleString()}. Current SL (${bot.stopLoss}) and TP (${bot.takeProfit}) reflect their deliberate choice. Treat these as intentional. You may flag a concern if the levels look dangerous given current conditions, but your recommendation should lean toward leaving them unchanged unless there is a clear, serious risk (e.g. price is within 0.5% of the stop-loss, or volatility has spiked dramatically since the edit).` : ''}

${marketState ? `REAL CURRENT MARKET CONDITIONS for ${bot.asset} (most recent ~48 hours, fetched live):
- Regime: ${marketState.regimeDisplay}
- Net price move (48h): ${marketState.stats.netChangePercent}%
- Annualized volatility: ${marketState.stats.annualizedVolPercent}%
- Liquidity: ${marketState.liquidityFlag === 'low' ? 'LOW — recent volume has dropped sharply' : 'normal'}
- Current price: ${marketState.currentPrice}

Use these REAL conditions to judge the position. A 2% move in high-volatility means something different from the same move in a quiet ranging market. In high-volatility, widening SL/TP to avoid noise-triggered stops is usually correct. In a clear trend, trailing the stop to lock in gains makes sense. In low liquidity, wider levels are safer.` : 'No live market data available — base assessment on price-move percentage alone and note this limitation in reasoning.'}

YOUR ROLE IS TO FLAG ONLY — DO NOT CHANGE ANYTHING.
Assess whether the current SL/TP levels are still appropriate given the position direction, price move, and market conditions. If you think an adjustment would be beneficial, describe it clearly in your reasoning — but the system will only log your recommendation as a flag, never apply it automatically. The trader remains in control.

Respond ONLY in JSON, no preamble, no markdown:
{
  "shouldAdjust": boolean,
  "suggestedStopLoss": number or null,
  "suggestedTakeProfit": number or null,
  "reasoning": "1-2 plain-English sentences explaining your assessment, referencing actual market conditions and position direction. If you think the levels are fine, say so. If you think they need adjusting, say what and why — but be clear this is a suggestion only."
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
    logDecision({
      type: 'risk_assessment',
      botId: bot.id,
      walletAddress: bot.walletAddress,
      reasoning: `Risk re-evaluation failed (${err.message}) — no flag raised.`,
      data: { currentPrice, movePercent, error: err.message },
      severity: 'warning',
    });
    bot.lastEvaluatedPrice = currentPrice;
    return;
  }
  logDecision({
    type: 'risk_assessment',
    botId: bot.id,
    walletAddress: bot.walletAddress,
    reasoning: assessment.reasoning || 'No reasoning provided.',
    data: {
      currentPrice,
      movePercent: parseFloat(movePercent.toFixed(2)),
      marketRegime: marketState?.regime || null,
      annualizedVolPercent: marketState?.stats?.annualizedVolPercent ?? null,
      liquidityFlag: marketState?.liquidityFlag || null,
      liveSide,
      hasUserEditedLevels: hasUserEdits,
      currentStopLoss: bot.stopLoss,
      currentTakeProfit: bot.takeProfit,
      suggestedStopLoss: assessment.suggestedStopLoss ?? null,
      suggestedTakeProfit: assessment.suggestedTakeProfit ?? null,
      flagged: !!assessment.shouldAdjust,
      leverage: bot.leverage || 1,
    },
    severity: assessment.shouldAdjust ? 'warning' : 'info',
  });

  if (assessment.shouldAdjust) {
    logDecision({
      type: 'sl_tp_flag',
      botId: bot.id,
      walletAddress: bot.walletAddress,
      reasoning: assessment.reasoning || 'AI recommends reviewing SL/TP given current conditions.',
      data: {
        currentStopLoss: bot.stopLoss,
        currentTakeProfit: bot.takeProfit,
        suggestedStopLoss: assessment.suggestedStopLoss ?? null,
        suggestedTakeProfit: assessment.suggestedTakeProfit ?? null,
        priceAtFlag: currentPrice,
        marketRegime: marketState?.regime || null,
        liveSide,
        hasUserEditedLevels: hasUserEdits,
        actionRequired: 'User review recommended — no automatic changes made.',
      },
      severity: 'warning',
    });

    console.log(`[RISK-MONITOR] ${bot.name} SL/TP FLAG (no change applied): suggested SL ${assessment.suggestedStopLoss}, TP ${assessment.suggestedTakeProfit} — side: ${liveSide}, regime: ${marketState?.regime || 'unknown'}`);
  } else {
    console.log(`[RISK-MONITOR] ${bot.name} SL/TP check: levels OK — side: ${liveSide}, regime: ${marketState?.regime || 'unknown'}`);
  }

  bot.lastEvaluatedPrice = currentPrice;
 
};