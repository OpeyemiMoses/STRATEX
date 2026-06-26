import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { getCurrentMarketState, assessStrategyFit } from '../services/marketState.js';
import { getContractConfig } from '../services/contractConfig.js';

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
router.post('/parse', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No strategy text provided' });

  try {
    const assetSystem = `Identify the crypto asset mentioned in this trading strategy text. Return ONLY the Bitget-style trading pair symbol (e.g. BTCUSDT, ETHUSDT, SOLUSDT, DOGEUSDT, MNTUSDT). No explanation, no markdown, just the symbol.`;
    const assetRaw = await qwen([{ role: 'user', content: text }], assetSystem);
    const detectedAsset = assetRaw.trim().toUpperCase().replace(/[^A-Z]/g, '');
    const assetGuess = /USDT$/.test(detectedAsset) ? detectedAsset : `${detectedAsset}USDT`;

    let livePrice = null;
    let assetUnavailable = false;
    try {
      const priceRes = await axios.get('https://api.bitget.com/api/v2/mix/market/ticker', {
        params: { symbol: assetGuess, productType: 'USDT-FUTURES' },
      });
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
        error: `${assetGuess.replace('USDT', '')} is not available for futures trading on Bitget. Please choose a different asset, such as BTC, ETH, SOL, or BNB.`,
      });
    }

    const contractConfig = await getContractConfig(assetGuess);
    const maxLever = contractConfig?.maxLever ?? 125;

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
- "action" must be "buy" for long positions and "sell" for short positions. Parse this carefully: "short", "sell", "go short", "short sell" → "sell". "buy", "long", "go long" → "buy".
- "entryType" must be "market" if the user wants to buy/sell immediately at current price (e.g. "buy now", "buy at current price", no specific price mentioned), or "limit" if the user specified a target price to wait for (e.g. "buy at $60k", "buy when it drops to $65").
- "asset" must be a Bitget-style symbol like BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT.
- "leverage" must be a number, 1 to ${maxLever} (this pair's real exchange-enforced max — never suggest a number above this even if the user asks for more). Extract it ONLY if the user explicitly mentions leverage (e.g. "5x leverage", "10x") — do NOT infer it from context. If not mentioned, set this to null. If the extracted leverage is above 20, mention in the summary that this is a high-risk leverage level.
- "missing" is an array of field names (from the list above) that the user did not specify and are needed: entryPrice or entryCondition, takeProfitPrice or takeProfitPercent, stopLossPrice or stopLossPercent, positionSizePercent or positionSizeUSDT.
- ALWAYS add "leverage" to "missing" UNLESS the user explicitly mentioned a leverage number in their text. This means leverage is now a required clarifying question for every strategy that didn't explicitly state it, same as stop loss.
- If stop loss wasn't mentioned, add "stopLossPrice" to "missing" — do not invent one.
- Return ONLY the JSON object. No markdown fences, no preamble, no explanation. Your response must start with { and end with }.`;

    const raw = await qwen([{ role: 'user', content: text }], system);
    let clean = raw.replace(/```json|```/g, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(clean);
    parsed.livePrice = livePrice || null;
    if (parsed.leverage && parsed.leverage > maxLever) {
      parsed.leverage = maxLever;
      parsed.leverageCapped = true;
      parsed.maxAllowedLeverage = maxLever;
    }
    console.log('[PARSE DEBUG]', JSON.stringify(parsed));
    res.json({ parsed });
  } catch (err) {
    console.error('Parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse strategy' });
  }
});

router.post('/clarify', async (req, res) => {
  const { missingField, strategyContext } = req.body;

  const isShort = strategyContext?.action === 'sell';

  const questionMap = {
    'entryPrice': {
      question: 'At what price do you want to enter this trade?',
      options: ['Current market price', 'Set a specific price', 'When RSI drops below 30', 'When price breaks above resistance'],
    },
    'entryCondition': {
      question: 'What condition should trigger your entry?',
      options: isShort
        ? ['Short at current price now', 'Wait for a price bounce to short', 'Wait for RSI overbought signal', 'Wait for MACD bearish crossover']
        : ['Buy at current price now', 'Wait for a price dip', 'Wait for RSI oversold signal', 'Wait for MACD crossover'],
    },
    'takeProfitPrice': {
      question: isShort
        ? 'At what price or % drop do you want to take profit?'
        : 'At what price or % gain do you want to take profit?',
      options: isShort
        ? ['2% below entry', '5% below entry', '10% below entry', 'Set a specific price']
        : ['2% above entry', '5% above entry', '10% above entry', 'Set a specific price'],
    },
    'takeProfitPercent': {
      question: isShort
        ? 'What % drop should trigger your take profit?'
        : 'What % gain should trigger your take profit?',
      options: ['2%', '5%', '10%', '20%'],
    },
    'stopLossPrice': {
      question: isShort
        ? 'At what price or % rise should the bot cut the position?'
        : 'At what price or % loss should the bot cut the position?',
      options: isShort
        ? ['1% above entry', '2% above entry', '5% above entry', 'Set a specific price']
        : ['1% below entry', '2% below entry', '5% below entry', 'Set a specific price'],
    },
    'stopLossPercent': {
      question: isShort
        ? 'What % rise should trigger your stop loss?'
        : 'What % loss should trigger your stop loss?',
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
    return res.json(questionMap.leverage);
  }

  const q = questionMap[missingField] || {
    question: `Can you clarify: ${missingField}?`,
    options: [],
  };

  res.json(q);
});

// POST /api/strategy/analyse
router.post('/analyse', async (req, res) => {
  const { parsed } = req.body;

  try {
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
- Funding rate: ${marketState.fundingRate !== null ? `${(marketState.fundingRate * 100).toFixed(3)}% per interval${marketState.fundingSignal !== 'neutral' ? ` -- market is crowded ${marketState.fundingSignal === 'crowded_long' ? 'long' : 'short'}` : ''}` : 'unavailable'}
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

Both userStrategy and saferStrategy MUST also include an "entryType" field: "market" or "limit".
The current live price for ${parsed.asset} is ${marketState ? marketState.currentPrice : (parsed.livePrice ?? 'unavailable')}.
Set entryType to "market" if that strategy's entryPrice is essentially the current price (entering
immediately makes sense). Set it to "limit" if that strategy's entryPrice is a different target price
the position should wait to reach before filling. Judge userStrategy and saferStrategy independently
-- they may end up with different entryType values from each other and from the user's original
entryType, e.g. the user wanted to buy now (market) but the safer version waits for a pullback to a
lower price (limit). This field is acted on directly by the system to decide how the bot actually
executes -- describing a "wait for a better price" idea only in prose, without setting entryType to
"limit", will cause the bot to ignore that recommendation and fill immediately at market instead.

Return ONLY valid JSON, no markdown:
{
  "riskLevel": "low" | "medium" | "high",
  "riskReasons": ["reason1", "reason2"],
  "shouldTradeNow": boolean,
  "shouldTradeNowReason": "1-2 sentences -- if false, explain why this pair/timing is not favorable right now, even though a strategy can still technically be created",
  "userStrategy": {
    "side": "long" | "short",
    "entryType": "market" | "limit",
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
    "entryType": "market" | "limit",
    "entryPrice": number,
    "takeProfitPrice": number,
    "stopLossPrice": number,
    "positionSizePercent": number,
    "leverage": number,
    "riskRewardRatio": "e.g. 1:3",
    "changes": ["what changed and why -- referencing actual current market conditions where relevant. If side differs from the user's original direction, the FIRST change listed must explicitly say so, e.g. 'Switched from long to short because...'. If entryType differs from the user's original entryType, mention that too, e.g. 'Switched to a limit order at $X to wait for a better entry.'"],
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

    const originalSide = parsed.action === 'sell' ? 'short' : 'long';
    if (analysis.userStrategy && !analysis.userStrategy.side) {
      analysis.userStrategy.side = originalSide;
    }
    if (analysis.saferStrategy && !analysis.saferStrategy.side) {
      analysis.saferStrategy.side = originalSide;
    }

    const livePriceRef = marketState?.currentPrice ?? parsed.livePrice ?? null;
    const deriveEntryType = (strategyObj) => {
      if (strategyObj?.entryType === 'market' || strategyObj?.entryType === 'limit') {
        return strategyObj.entryType;
      }
      if (livePriceRef && strategyObj?.entryPrice) {
        const diffPercent = Math.abs((strategyObj.entryPrice - livePriceRef) / livePriceRef) * 100;
        return diffPercent < 0.3 ? 'market' : 'limit';
      }
      return parsed.entryType || 'market';
    };
    if (analysis.userStrategy) analysis.userStrategy.entryType = deriveEntryType(analysis.userStrategy);
    if (analysis.saferStrategy) analysis.saferStrategy.entryType = deriveEntryType(analysis.saferStrategy);

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


router.post('/market-analysis', async (req, res) => {
  const TOP_SYMBOLS = [
    'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
    'AVAXUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','MATICUSDT',
  ];
  const PRODUCT_TYPE = 'USDT-FUTURES';

  try {
    const tickerRes = await axios.get('https://api.bitget.com/api/v2/mix/market/tickers', {
      params: { productType: PRODUCT_TYPE },
    });
    const allTickers = tickerRes.data?.data || [];

    const marketData = allTickers
      .filter(t => TOP_SYMBOLS.includes(t.symbol))
      .map(t => ({
        symbol: t.symbol.replace('USDT', ''),
        pair: t.symbol,
        price: parseFloat(t.lastPr),
        change24h: parseFloat(t.change24h) * 100,
        high24h: parseFloat(t.high24h),
        low24h: parseFloat(t.low24h),
        volume24hUSDT: parseFloat(t.quoteVolume),
        fundingRate: parseFloat(t.fundingRate) * 100,
        openInterest: parseFloat(t.holdingAmount),
      }))
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));

    if (!marketData.length) {
      return res.status(502).json({ error: 'No market data returned from Bitget' });
    }

    const system = `You are a professional crypto market analyst. You will be given REAL live market data from Bitget's USDT-M perpetual futures market right now.

Your task:
1. Write a concise market analysis (4-6 sentences) covering: overall market sentiment, which assets are leading/lagging, notable volume or funding rate signals, and any regime you see (trending, ranging, risk-on/off).
2. Generate 3 high-quality trade signals based strictly on the data provided. Each signal must be grounded in the actual numbers — reference the specific price, change, or funding rate that justifies the signal.

Return ONLY valid JSON, no markdown fences:
{
  "analysis": "your 4-6 sentence analysis here",
  "signals": [
    {
      "symbol": "BTCUSDT",
      "name": "Bitcoin",
      "direction": "LONG",
      "currentPrice": 65000,
      "entry": "$64,800 - $65,200",
      "takeProfit": "$68,000",
      "stopLoss": "$63,500",
      "confidence": "High",
      "timeframe": "4h",
      "reasoning": "1-2 sentences referencing the actual data that supports this signal"
    }
  ]
}

Rules:
- direction must be "LONG" or "SHORT"
- confidence must be "High", "Medium", or "Low"
- entry/takeProfit/stopLoss must be price strings with $ sign
- symbol must match what you were given (e.g. "BTCUSDT")
- name is the full asset name (Bitcoin, Ethereum, etc.)
- base signals on the real data — if a coin is down 8% with high volume, that's bearish. If funding rate is very negative on a coin that's recovering, that's a potential long squeeze.`;

    const userContent = `Here is the current live market data from Bitget futures (as of right now):

${marketData.map(m =>
  `${m.symbol}: $${m.price.toLocaleString()} | 24h: ${m.change24h >= 0 ? '+' : ''}${m.change24h.toFixed(2)}% | High: $${m.high24h.toLocaleString()} | Low: $${m.low24h.toLocaleString()} | Volume: $${(m.volume24hUSDT / 1e6).toFixed(1)}M | Funding: ${m.fundingRate.toFixed(4)}%`
).join('\n')}

Analyse this data and generate 3 trade signals.`;

    const raw = await qwen([{ role: 'user', content: userContent }], system);
    const clean = raw.replace(/```json|```/g, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    const parsed = JSON.parse(clean.slice(firstBrace, lastBrace + 1));

    res.json({
      analysis: parsed.analysis || '',
      signals: parsed.signals || [],
    });
  } catch (err) {
    console.error('Market analysis error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market analysis' });
  }
});

// POST /api/strategy/whale-analysis
router.post('/whale-analysis', async (req, res) => {
  const WATCH_SYMBOLS = [
    'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
    'AVAXUSDT','DOGEUSDT','ADAUSDT','MATICUSDT','SHIBUSDT',
  ];
  const PRODUCT_TYPE = 'USDT-FUTURES';
  const WHALE_THRESHOLD_USD = 500_000;

  try {
    const allTrades = [];
    await Promise.allSettled(
      WATCH_SYMBOLS.map(async (symbol) => {
        try {
          const { data } = await axios.get('https://api.bitget.com/api/v2/mix/market/fills', {
            params: { symbol, limit: 100, productType: PRODUCT_TYPE },
          });
          if (data.code !== '00000' || !Array.isArray(data.data)) return;
          for (const fill of data.data) {
            const price = parseFloat(fill.price);
            const size = parseFloat(fill.size);
            const usdValue = price * size;
            if (usdValue < WHALE_THRESHOLD_USD) continue;
            allTrades.push({
              symbol: symbol.replace('USDT', ''),
              side: fill.side,
              price,
              size,
              usdValue,
              minutesAgo: Math.round((Date.now() - parseInt(fill.ts)) / 60000),
            });
          }
        } catch (_) {}
      })
    );

    allTrades.sort((a, b) => b.usdValue - a.usdValue);
    const topTrades = allTrades.slice(0, 15);

    let oiSummary = '';
    try {
      const oiRes = await axios.get('https://api.bitget.com/api/v2/mix/market/open-interest', {
        params: { symbol: 'BTCUSDT', productType: PRODUCT_TYPE },
      });
      const oi = oiRes.data?.data;
      if (oi) {
        oiSummary = `BTC open interest: ${parseFloat(oi.openInterestList?.[0]?.size || 0).toLocaleString()} contracts`;
      }
    } catch (_) {}

    if (!topTrades.length) {
      const analysis = await qwen(
        [{ role: 'user', content: 'No trades above $500k were detected in the last sample window across BTC, ETH, SOL, BNB, XRP, AVAX, DOGE, ADA, MATIC, SHIB. What does an absence of visible whale activity typically signal? Keep it to 3-4 sentences.' }],
        'You are a crypto on-chain and order-flow analyst. Be honest about data limitations.'
      );
      return res.json({ analysis });
    }

    const system = `You are a crypto market analyst specialising in large-order flow and whale behaviour on perpetual futures markets. You will be given REAL recent trade data from Bitget — only trades above $500,000 USD are included.

Analyse this data in 5-6 sentences covering:
- Which assets whales are buying vs selling
- Whether the buying/selling is clustered (same symbol, same direction) or dispersed
- What the aggregate whale sentiment implies for short-term price action
- Any contrarian signals (e.g. large sells into a rising asset, or large buys on a recent dip)

Be specific — reference the actual symbols, sizes, and directions from the data. Do not be vague. Return only the analysis text, no JSON, no headings.`;

    const userContent = `Real whale trades from Bitget futures in the last few minutes (trades ≥ $500,000 USD):

${topTrades.map(t =>
  `${t.symbol} | ${t.side.toUpperCase()} | $${(t.usdValue / 1000).toFixed(0)}K | ${t.minutesAgo < 1 ? 'just now' : `${t.minutesAgo}m ago`} @ $${t.price.toLocaleString()}`
).join('\n')}

${oiSummary ? `\nAdditional context: ${oiSummary}` : ''}

What does this whale activity tell us about current market positioning?`;

    const analysis = await qwen([{ role: 'user', content: userContent }], system);
    res.json({ analysis });
  } catch (err) {
    console.error('Whale analysis error:', err.message);
    res.status(500).json({ error: 'Failed to fetch whale analysis' });
  }
});

export default router;