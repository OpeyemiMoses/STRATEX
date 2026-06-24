import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { getCurrentMarketState, assessStrategyFit } from '../services/marketState.js';

dotenv.config();

const router = express.Router();

const qwen = async (messages, systemPrompt) => {
  const response = await axios.post(
    `${process.env.QWEN_BASE_URL}/chat/completions`,
    {
      model: 'qwen3.6-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 1500,
      temperature: 0.3,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.choices[0].message.content;
};

// POST /api/strategy/parse
// First pass: parse natural language into structured fields, identify what's missing
router.post('/parse', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No strategy text provided' });

  try {
    // First pass: ask Qwen to identify just the asset, fast and cheap
    const assetSystem = `Identify the crypto asset mentioned in this trading strategy text. Return ONLY the Bitget-style trading pair symbol (e.g. BTCUSDT, ETHUSDT, SOLUSDT, DOGEUSDT, MNTUSDT). No explanation, no markdown, just the symbol.`;
    const assetRaw = await qwen([{ role: 'user', content: text }], assetSystem);
    const detectedAsset = assetRaw.trim().toUpperCase().replace(/[^A-Z]/g, '');
    const assetGuess = /USDT$/.test(detectedAsset) ? detectedAsset : `${detectedAsset}USDT`;

    let livePrice = null;
    let assetUnavailable = false;
    try {
      const priceRes = await axios.get(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${assetGuess}`);
      livePrice = parseFloat(priceRes.data?.data?.[0]?.lastPr);
      if (!livePrice || isNaN(livePrice)) {
        assetUnavailable = true;
      }
      console.log(`[LIVE PRICE DEBUG] assetGuess=${assetGuess}, livePrice=${livePrice}`);
    } catch (e) {
      assetUnavailable = true;
      console.error(`Live price fetch failed for ${assetGuess}:`, e.message);
    }

    if (assetUnavailable) {
      return res.json({
        parsed: null,
        error: `${assetGuess.replace('USDT', '')} is not available for trading on Bitget. Please choose a different asset, such as BTC, ETH, SOL, or BNB.`,
      });
    }

    const system = `You are a trading strategy parser for a crypto trading bot platform.
${livePrice ? `The current live market price of ${assetGuess} is $${livePrice}. Use this as ground truth for any "current price" or "buy now" type entries.` : `No live price was available for ${assetGuess} — if this asset isn't tradeable on Bitget, mention that in the summary.`}

You MUST return a JSON object with EXACTLY these field names, no others, no renaming:
{
  "asset": "BTCUSDT",
  "action": "buy",
  "entryType": "market",
  "entryPrice": 0,
  "entryCondition": null,
  "takeProfitPrice": 0,
  "takeProfitPercent": null,
  "stopLossPrice": null,
  "stopLossPercent": null,
  "positionSizePercent": null,
  "positionSizeUSDT": null,
  "timeframe": "1h",
  "leverage": 1,
  "missing": [],
  "summary": "one sentence summary"
}

Rules:
- Field names must match exactly as shown above. Do NOT use "symbol", "entry", "take_profit", "stop_loss", "direction", or any other naming.
- "entryType" must be "market" if the user wants to buy/sell immediately at current price (e.g. "buy now", "buy at current price", no specific price mentioned), or "limit" if the user specified a target price to wait for (e.g. "buy at $60k", "buy when it drops to $65").
- "asset" must be a Bitget-style symbol like BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT.
- "leverage" must be a number, 1 to 125. Extract it ONLY if the user explicitly mentions leverage (e.g. "5x leverage", "10x", "with 3x leverage on this trade") — do NOT infer leverage from context, only from explicit mention. If the user did not mention leverage, set this to null (not 1) — the user will be asked directly. If the extracted leverage is above 20, mention in the summary that this is a high-risk leverage level.
- "missing" is an array of field names (from the list above) that the user did not specify and are needed: entryPrice or entryCondition, takeProfitPrice or takeProfitPercent, stopLossPrice or stopLossPercent, positionSizePercent or positionSizeUSDT.
- ALWAYS add "leverage" to "missing" UNLESS the user explicitly mentioned a leverage number in their text. This means leverage is now a required clarifying question for every strategy that didn't explicitly state it, same as stop loss.
- If stop loss wasn't mentioned, add "stopLossPrice" to "missing" — do not invent one.
- Return ONLY the JSON object. No markdown fences, no preamble, no explanation. Your response must start with { and end with }.`;

    const raw = await qwen([{ role: 'user', content: text }], system);
    let clean = raw.replace(/```json|```/g, '').trim();
    // Strip any preamble text before the first { and after the last }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(clean);
    parsed.livePrice = livePrice || null;
    console.log('[PARSE DEBUG]', JSON.stringify(parsed));
    res.json({ parsed });
  } catch (err) {
    console.error('Parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse strategy' });
  }
});

// POST /api/strategy/clarify
// Get the next clarifying question for a missing field
router.post('/clarify', async (req, res) => {
  const { missingField, strategyContext } = req.body;

  const questionMap = {
    'entryPrice': {
      question: 'At what price do you want to enter this trade?',
      options: ['Current market price', 'Set a specific price', 'When RSI drops below 30', 'When price breaks above resistance'],
    },
    'entryCondition': {
      question: 'What condition should trigger your entry?',
      options: ['Buy at current price now', 'Wait for a price dip', 'Wait for RSI oversold signal', 'Wait for MACD crossover'],
    },
    'takeProfitPrice': {
      question: 'At what price or % gain do you want to take profit?',
      options: ['2% above entry', '5% above entry', '10% above entry', 'Set a specific price'],
    },
    'takeProfitPercent': {
      question: 'What % gain should trigger your take profit?',
      options: ['2%', '5%', '10%', '20%'],
    },
    'stopLossPrice': {
      question: 'At what price or % loss should the bot cut the position?',
      options: ['1% below entry', '2% below entry', '5% below entry', 'Set a specific price'],
    },
    'stopLossPercent': {
      question: 'What % loss should trigger your stop loss?',
      options: ['1%', '2%', '5%', '10%'],
    },
    'positionSizePercent': {
      question: 'What % of your portfolio should this trade use?',
      options: ['5%', '10%', '25%', '50%'],
    },
    'positionSizeUSDT': {
      question: 'How much USDT do you want to allocate to this trade?',
      options: ['$50', '$100', '$250', '$500'],
    },
    'timeframe': {
      question: 'What timeframe should the bot monitor for this strategy?',
      options: ['1 minute', '5 minutes', '1 hour', '4 hours', '1 day'],
    },
    // Static fallback only -- used if the market-aware leverage branch
    // below fails to fetch live data. The normal path overrides this.
    'leverage': {
      question: 'Do you want to use leverage on this trade?',
      options: ['No leverage', '2x', '5x', '10x'],
    },
  };

  // Leverage is handled separately from the static questionMap above
  // because it needs to be market-aware (Section 3, #7): the options
  // offered should reflect CURRENT volatility for this specific pair,
  // not always default to the same fixed [2x, 5x, 10x] regardless of
  // conditions. In a highly volatile market, even 5x carries meaningfully
  // more liquidation risk than the same multiplier in a calm market, so
  // the question and the options themselves change to reflect that.
  if (missingField === 'leverage') {
    try {
      const asset = strategyContext?.asset;
      const marketState = asset ? await getCurrentMarketState(asset, strategyContext?.timeframe || '1h') : null;

      if (marketState?.regime === 'high_volatility') {
        return res.json({
          question: `Do you want to use leverage? Note: ${asset} is currently highly volatile (${marketState.stats.annualizedVolPercent}% annualized) — higher leverage carries more liquidation risk than usual right now.`,
          options: ['No leverage', '2x', '3x'],
        });
      }
      if (marketState) {
        return res.json({
          question: `Do you want to use leverage on this trade? (${asset} is currently ${marketState.regimeDisplay.toLowerCase()})`,
          options: ['No leverage', '2x', '5x', '10x'],
        });
      }
    } catch (err) {
      console.error('Market-aware leverage question failed, falling back to default:', err.message);
    }
    // Fall through to the static default if market state couldn't be fetched
    return res.json(questionMap.leverage);
  }

  const q = questionMap[missingField] || {
    question: `Can you clarify: ${missingField}?`,
    options: [],
  };

  res.json(q);
});

// POST /api/strategy/analyse
// Full risk analysis + safer version suggestion
router.post('/analyse', async (req, res) => {
  const { parsed } = req.body;

  try {
    // --- Market-aware pre-check (Section 3, #3/#4/#5) ---
    // Fetch CURRENT conditions for this pair before asking Qwen for a safer
    // strategy, and run a fast, deterministic structural-fit check. This
    // runs BEFORE any AI call -- it's the actual pre-creation gate: a
    // strategy that's structurally mismatched to current conditions (e.g.
    // a sub-1% TP/SL in a highly volatile market) gets flagged immediately,
    // rather than only being discoverable after the bot is already live.
    const marketState = await getCurrentMarketState(parsed.asset, parsed.timeframe || '1h');
    const fitAssessment = assessStrategyFit(marketState, parsed);

    const system = `You are a professional crypto trading risk analyst.
A user has described a trading strategy and you must:
1. Analyse the risk of their strategy
2. Suggest a safer version with improved risk/reward -- one that is suited to the CURRENT market
   conditions described below, not just a generically tighter version of the user's numbers
3. Explain your reasoning clearly but concisely

${marketState ? `CURRENT MARKET CONDITIONS for ${parsed.asset} (most recent ~48 hours):
- Regime: ${marketState.regimeDisplay}
- Net price move: ${marketState.stats.netChangePercent}%
- Annualized volatility: ${marketState.stats.annualizedVolPercent}%
- Liquidity: ${marketState.liquidityFlag === 'low' ? 'LOW -- recent volume has dropped sharply' : 'normal'}
- Current price: ${marketState.currentPrice}

Use these REAL current conditions to shape the safer strategy: in a trending market, the safer
version should generally trail the trend rather than fight it; in a sideways/ranging market, wider
or more conservative targets may be more realistic than aggressive ones; in high-volatility
conditions, stop-loss and take-profit should be wide enough to not be triggered by normal noise.
Do not just shrink position size and call it safer -- the safer strategy should reflect what is
ACTUALLY happening in this market right now.` : 'No live market data was available for this pair -- base your analysis on the strategy parameters alone, and mention in riskReasons that current market conditions could not be verified.'}

${fitAssessment.mismatch ? `STRUCTURAL MISMATCH DETECTED: ${fitAssessment.reason}
${fitAssessment.severity === 'severe' ? 'This is severe enough that you should seriously consider recommending the user NOT trade this pair right now, or wait for conditions to change -- say so explicitly in your recommendation if you agree.' : 'Factor this into your risk assessment and safer-strategy suggestion.'}` : ''}

If the strategy includes leverage above 1x, factor that into your risk assessment — higher leverage
means a smaller adverse price move can wipe out the position (liquidation risk), so the "safer"
version should generally recommend lower leverage when the user's leverage is aggressive (above ~10x),
and should explicitly mention liquidation risk in riskReasons when leverage is a meaningful risk factor.
Also factor current volatility into the leverage recommendation: high-volatility conditions make any
given leverage level riskier than the same leverage would be in calmer conditions.

The user's original direction is "${parsed.action === 'sell' ? 'short' : 'long'}". Both userStrategy
and saferStrategy MUST include a "side" field ("long" or "short"). userStrategy.side should normally
just echo the user's original direction unless their own numbers are logically inconsistent with it
(e.g. they said "buy" but their stop loss is above entry and take profit is below it -- that is
actually a short, not a long, regardless of which word they used).

saferStrategy.side is allowed to differ from the user's original direction. If current market
conditions (the regime, recent net change, momentum) genuinely favor the opposite direction --
for example the user wants to go long but the pair is in a clear downtrend -- set saferStrategy.side
to the direction you actually recommend, NOT the user's original direction. This is a real, structural
recommendation, not just commentary: if you say "safer to short this instead" anywhere in your
reasoning, saferStrategy.side MUST be "short" and saferStrategy.entryPrice/takeProfitPrice/stopLossPrice
MUST be consistent with a short (take profit below entry, stop loss above entry). Never describe a
direction flip in "changes" or "verdict" without setting "side" to match -- the side field is what
the system actually acts on, prose is not enough.

Return ONLY valid JSON, no markdown:
{
  "riskLevel": "low" | "medium" | "high",
  "riskReasons": ["reason1", "reason2"],
  "shouldTradeNow": boolean,
  "shouldTradeNowReason": "1-2 sentences -- if false, explain why this pair/timing is not favorable right now, even though a strategy can still technically be created",
  "userStrategy": {
    "side": "long" | "short",
    "entryPrice": number,
    "takeProfitPrice": number,
    "stopLossPrice": number,
    "positionSizePercent": number,
    "leverage": number,
    "riskRewardRatio": "e.g. 1:2",
    "verdict": "short verdict on this strategy"
  },
  "saferStrategy": {
    "side": "long" | "short",
    "entryPrice": number,
    "takeProfitPrice": number,
    "stopLossPrice": number,
    "positionSizePercent": number,
    "leverage": number,
    "riskRewardRatio": "e.g. 1:3",
    "changes": ["what changed and why -- referencing actual current market conditions where relevant. If side differs from the user's original direction, the FIRST change listed must explicitly say so, e.g. 'Switched from long to short because...'"],
    "verdict": "short verdict on safer version"
  },
  "recommendation": "which version you recommend and why in 1-2 sentences"
}`;

    const raw = await qwen(
      [{ role: 'user', content: `Analyse this trading strategy: ${JSON.stringify(parsed)}` }],
      system
    );
    const clean = raw.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(clean);

    // NEW — defensive fallback: if Qwen omits "side" on either strategy
    // (older clients, malformed response, etc.), default each one to the
    // user's original parsed direction rather than leaving it undefined.
    // This guarantees CreateStrategy.jsx always has a side to read, even
    // in a degraded case, without silently producing the WRONG side.
    const originalSide = parsed.action === 'sell' ? 'short' : 'long';
    if (analysis.userStrategy && !analysis.userStrategy.side) {
      analysis.userStrategy.side = originalSide;
    }
    if (analysis.saferStrategy && !analysis.saferStrategy.side) {
      analysis.saferStrategy.side = originalSide;
    }

    // Always attach the raw market state + fit assessment too, so the
    // frontend can show this even if Qwen's own shouldTradeNow field is
    // missing/malformed -- the deterministic check is a reliable fallback.
    analysis.marketState = marketState;
    analysis.fitAssessment = fitAssessment;
    if (analysis.shouldTradeNow === undefined) {
      analysis.shouldTradeNow = !(fitAssessment.mismatch && fitAssessment.severity === 'severe');
    }

    res.json({ analysis });
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: 'Failed to analyse strategy' });
  }
});

// POST /api/strategy/analyze (existing — bot verdict for backtest modal)
router.post('/analyze', async (req, res) => {
  const { bot, backtestResults } = req.body;
  try {
    const system = `You are a trading bot performance analyst. Given a bot's config and backtest results, give a clear verdict: should the user KEEP RUNNING this bot, PAUSE it, or STOP it? Be direct and concise. Max 4 sentences.`;
    const content = `Bot: ${JSON.stringify(bot)}\nBacktest: ${JSON.stringify(backtestResults)}`;
    const analysis = await qwen([{ role: 'user', content }], system);
    res.json({ analysis });
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: 'Failed to analyze' });
  }
});

// POST /api/strategy/market-analysis
router.post('/market-analysis', async (req, res) => {
  const { asset } = req.body;
  try {
    const system = `You are a crypto market analyst. Give a concise market analysis for the requested asset. Include trend, key levels, and a trade signal. Max 150 words.`;
    const analysis = await qwen([{ role: 'user', content: `Analyse ${asset || 'BTC'} market conditions` }], system);
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/strategy/whale-analysis
router.post('/whale-analysis', async (req, res) => {
  try {
    const system = `You are a crypto on-chain analyst specialising in whale activity. Describe recent whale movements and what they signal for the market. Max 150 words.`;
    const analysis = await qwen([{ role: 'user', content: 'Summarise recent whale activity in crypto markets' }], system);
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;