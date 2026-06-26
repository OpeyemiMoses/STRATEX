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

const isAdjustmentSafe = (side, currentPrice, suggestedStopLoss, suggestedTakeProfit) => {
  const isShort = side === 'short';
  if (suggestedStopLoss != null) {
    const sl = parseFloat(suggestedStopLoss);
    if (isNaN(sl)) return false;
    if (isShort ? sl <= currentPrice : sl >= currentPrice) return false;
  }
  if (suggestedTakeProfit != null) {
    const tp = parseFloat(suggestedTakeProfit);
    if (isNaN(tp)) return false;
    if (isShort ? tp >= currentPrice : tp <= currentPrice) return false;
  }
  return true;
};

export const reevaluatePosition = async (bot, currentPrice) => {
  const priorPrice = bot.lastEvaluatedPrice || bot.filledEntry;
  const movePercent = ((currentPrice - priorPrice) / priorPrice) * 100;
  const liveSide = bot.side || 'long';
  const hasUserEdits = bot.slTpAdjustmentHistory?.some(h => h.source === 'user_edit');
  const lastUserEdit = hasUserEdits
    ? bot.slTpAdjustmentHistory.filter(h => h.source === 'user_edit').at(-1)
    : null;
  const priorAutoAdjustments = bot.slTpAdjustmentHistory?.filter(h => h.source === 'ai_auto').length || 0;
  const baseline = bot.openedWith || null;

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
${baseline ? `Originally opened with: stop-loss ${baseline.stopLoss}, take-profit ${baseline.takeProfit}${priorAutoAdjustments > 0 ? ` (this position has already been auto-adjusted ${priorAutoAdjustments} time${priorAutoAdjustments === 1 ? '' : 's'} since then — the current SL/TP above reflect the latest state, not the original).` : '.'}` : ''}
${bot.liquidationPrice ? `Liquidation price: ${bot.liquidationPrice} (fixed by entry + leverage, cannot move).` : ''}

IMPORTANT — POSITION SIDE: This is a ${liveSide.toUpperCase()} position.${liveSide !== (bot.originalAction === 'sell' ? 'short' : 'long') ? ' The AI risk analyser swapped the direction from the user\'s original intent before deployment — the current side is what matters, not the original.' : ''}
For a LONG: profit when price rises, loss when price falls. Stop-loss must be BELOW entry, take-profit must be ABOVE entry.
For a SHORT: profit when price falls, loss when price rises. Stop-loss must be ABOVE entry, take-profit must be BELOW entry.
Any suggested adjustments MUST respect this direction, AND must keep the stop-loss and take-profit on
the correct side of the CURRENT price (${currentPrice}) — a suggestion that would trigger an immediate
close is invalid and will be rejected by the system without being applied.

${hasUserEdits ? `USER-EDITED LEVELS: The trader manually adjusted SL/TP on ${new Date(lastUserEdit.timestamp).toLocaleString()}. Current SL (${bot.stopLoss}) and TP (${bot.takeProfit}) reflect their deliberate choice. Treat these as intentional. Only override them if there is a clear, serious risk (e.g. price is within 0.5% of the stop-loss, or volatility has spiked dramatically since the edit) — do not casually second-guess a deliberate manual choice.` : ''}

${marketState ? `REAL CURRENT MARKET CONDITIONS for ${bot.asset} (most recent ~48 hours, fetched live):
- Regime: ${marketState.regimeDisplay}
- Net price move (48h): ${marketState.stats.netChangePercent}%
- Annualized volatility: ${marketState.stats.annualizedVolPercent}%
- Liquidity: ${marketState.liquidityFlag === 'low' ? 'LOW — recent volume has dropped sharply' : 'normal'}
- Current price: ${marketState.currentPrice}

Use these REAL conditions to judge the position. A 2% move in high-volatility means something different from the same move in a quiet ranging market. In high-volatility, widening SL/TP to avoid noise-triggered stops is usually correct. In a clear trend, trailing the stop to lock in gains makes sense. In low liquidity, wider levels are safer.` : 'No live market data available — base assessment on price-move percentage alone and note this limitation in reasoning.'}

YOUR ROLE: You have full authority to adjust this position's stop-loss and/or take-profit directly —
there is no human confirmation step. If shouldAdjust is true, whatever you put in suggestedStopLoss/
suggestedTakeProfit will be applied immediately and logged for the trader to review afterward. Because
of this, only set shouldAdjust to true when you are genuinely confident the change is a real
improvement — not for minor or speculative tweaks. If you only want to change one of the two values,
set the other to its CURRENT value (not null) so it is left unchanged. If you don't want to adjust
anything, set shouldAdjust to false.

Respond ONLY in JSON, no preamble, no markdown:
{
  "shouldAdjust": boolean,
  "suggestedStopLoss": number or null,
  "suggestedTakeProfit": number or null,
  "reasoning": "1-2 plain-English sentences explaining what you did and why, referencing actual market conditions and position direction. If you decided not to adjust, say why the current levels are still fine."
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
      reasoning: `Risk re-evaluation failed (${err.message}) — no adjustment made.`,
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

  const hasConcreteSuggestion = assessment.suggestedStopLoss != null || assessment.suggestedTakeProfit != null;

  if (assessment.shouldAdjust && hasConcreteSuggestion) {
    const safe = isAdjustmentSafe(liveSide, currentPrice, assessment.suggestedStopLoss, assessment.suggestedTakeProfit);

    if (!safe) {
      logDecision({
        type: 'sl_tp_adjustment_rejected',
        botId: bot.id,
        walletAddress: bot.walletAddress,
        reasoning: `AI proposed an adjustment (SL ${assessment.suggestedStopLoss ?? bot.stopLoss}, TP ${assessment.suggestedTakeProfit ?? bot.takeProfit}) that the system rejected as unsafe relative to the current price (${currentPrice}) — no change applied. AI's original reasoning: ${assessment.reasoning || 'none provided.'}`,
        data: {
          currentPrice,
          rejectedStopLoss: assessment.suggestedStopLoss ?? null,
          rejectedTakeProfit: assessment.suggestedTakeProfit ?? null,
          currentStopLoss: bot.stopLoss,
          currentTakeProfit: bot.takeProfit,
          liveSide,
        },
        severity: 'warning',
      });
      console.log(`[RISK-MONITOR] ${bot.name} adjustment REJECTED (unsafe relative to price ${currentPrice}) — levels unchanged.`);
    } else {
      const oldSL = bot.stopLoss;
      const oldTP = bot.takeProfit;

      if (assessment.suggestedStopLoss != null) bot.stopLoss = parseFloat(assessment.suggestedStopLoss);
      if (assessment.suggestedTakeProfit != null) bot.takeProfit = parseFloat(assessment.suggestedTakeProfit);

      bot.slTpAdjustmentHistory = bot.slTpAdjustmentHistory || [];
      bot.slTpAdjustmentHistory.push({
        timestamp: new Date().toISOString(),
        source: 'ai_auto',
        price: currentPrice,
        oldStopLoss: oldSL,
        newStopLoss: bot.stopLoss,
        oldTakeProfit: oldTP,
        newTakeProfit: bot.takeProfit,
        reasoning: assessment.reasoning || null,
      });

      bot.tradelog = bot.tradelog || [];
      bot.tradelog.unshift({
        time: new Date().toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }),
        timestamp: new Date().toISOString(),
        side: 'AI Adjust',
        price: typeof currentPrice === 'number' ? currentPrice.toFixed(2) : String(currentPrice),
        quantity: null,
        size: '—',
        pnl: `SL: $${bot.stopLoss} · TP: $${bot.takeProfit}`,
        balanceChange: null,
        type: 'ai-auto-adjustment',
      });

      logDecision({
        type: 'sl_tp_auto_adjustment',
        botId: bot.id,
        walletAddress: bot.walletAddress,
        reasoning: assessment.reasoning || 'AI adjusted SL/TP given current conditions.',
        data: {
          oldStopLoss: oldSL,
          newStopLoss: bot.stopLoss,
          oldTakeProfit: oldTP,
          newTakeProfit: bot.takeProfit,
          priceAtAdjustment: currentPrice,
          marketRegime: marketState?.regime || null,
          liveSide,
          hasUserEditedLevels: hasUserEdits,
        },
        severity: 'warning',
      });

      console.log(`[RISK-MONITOR] ${bot.name} AUTO-ADJUSTED — SL ${oldSL}→${bot.stopLoss}, TP ${oldTP}→${bot.takeProfit} — side: ${liveSide}, regime: ${marketState?.regime || 'unknown'}`);
    }
  } else if (assessment.shouldAdjust) {
    console.log(`[RISK-MONITOR] ${bot.name} flagged shouldAdjust with no concrete SL/TP values — skipping.`);
  } else {
    console.log(`[RISK-MONITOR] ${bot.name} SL/TP check: levels OK — side: ${liveSide}, regime: ${marketState?.regime || 'unknown'}`);
  }

  bot.lastEvaluatedPrice = currentPrice;
};