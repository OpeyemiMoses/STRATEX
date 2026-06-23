import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

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
    'leverage': {
      question: 'Do you want to use leverage on this trade?',
      options: ['No leverage', '2x', '5x', '10x'],
    },
  };

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
    const system = `You are a professional crypto trading risk analyst. 
A user has described a trading strategy and you must:
1. Analyse the risk of their strategy
2. Suggest a safer version with improved risk/reward
3. Explain your reasoning clearly but concisely

If the strategy includes leverage above 1x, factor that into your risk assessment — higher leverage
means a smaller adverse price move can wipe out the position (liquidation risk), so the "safer"
version should generally recommend lower leverage when the user's leverage is aggressive (above ~10x),
and should explicitly mention liquidation risk in riskReasons when leverage is a meaningful risk factor.

Return ONLY valid JSON, no markdown:
{
  "riskLevel": "low" | "medium" | "high",
  "riskReasons": ["reason1", "reason2"],
  "userStrategy": {
    "entryPrice": number,
    "takeProfitPrice": number,
    "stopLossPrice": number,
    "positionSizePercent": number,
    "leverage": number,
    "riskRewardRatio": "e.g. 1:2",
    "verdict": "short verdict on this strategy"
  },
  "saferStrategy": {
    "entryPrice": number,
    "takeProfitPrice": number,
    "stopLossPrice": number,
    "positionSizePercent": number,
    "leverage": number,
    "riskRewardRatio": "e.g. 1:3",
    "changes": ["what changed and why"],
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