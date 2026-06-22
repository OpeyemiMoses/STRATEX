import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const FIELD_LABELS = {
  entryPrice: 'Entry Price',
  entryCondition: 'Entry Condition',
  takeProfitPrice: 'Take Profit Price',
  takeProfitPercent: 'Take Profit %',
  stopLossPrice: 'Stop Loss Price',
  stopLossPercent: 'Stop Loss %',
  positionSizePercent: 'Position Size %',
  positionSizeUSDT: 'Position Size (USDT)',
  timeframe: 'Timeframe',
};

const STEPS = {
  INPUT: 'input',
  CLARIFYING: 'clarifying',
  ANALYSING: 'analysing',
  REVIEW: 'review',
  CREATING: 'creating',
};

export default function CreateStrategy() {
  const navigate = useNavigate();
  const { address } = useAccount();

  // Core state
  const [step, setStep] = useState(STEPS.INPUT);
  const [strategyText, setStrategyText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [currentMissingIndex, setCurrentMissingIndex] = useState(0);
  const [clarifyQuestion, setClarifyQuestion] = useState(null);
  const [clarifyInput, setClarifyInput] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [chosenStrategy, setChosenStrategy] = useState(null); // 'user' | 'safer'
  const [editingStrategy, setEditingStrategy] = useState(null); // null | 'user' | 'safer'
  const [editValues, setEditValues] = useState({});
  const [botName, setBotName] = useState('');
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Chat history for display
  const [chatHistory, setChatHistory] = useState([]);

  const addChat = (role, content, type = 'text') => {
    setChatHistory(prev => [...prev, { role, content, type, id: Date.now() + Math.random() }]);
  };

  // ── Step 1: Parse the initial strategy text ──
  const handleParse = async () => {
    if (!strategyText.trim()) return;
    setError('');
    addChat('user', strategyText);
    setStep(STEPS.ANALYSING);

    try {
      const res = await fetch(`${API}/api/strategy/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: strategyText }),
      });
    const data = await res.json();

      if (data.error) {
        setError(data.error);
        setStep(STEPS.INPUT);
        return;
      }

      const p = data.parsed;
      setParsed(p);

      addChat('ai', `Got it. ${p.summary}`, 'summary');

      if (p.missing && p.missing.length > 0) {
        setMissingFields(p.missing);
        setCurrentMissingIndex(0);
        await fetchClarifyQuestion(p.missing[0], p);
      } else {
        await runAnalysis(p);
      }
    } catch (err) {
      setError('Failed to parse strategy. Please try again.');
      setStep(STEPS.INPUT);
    }
  };

  // ── Step 2: Get clarifying question for next missing field ──
  const fetchClarifyQuestion = async (field, context) => {
    try {
      const res = await fetch(`${API}/api/strategy/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missingField: field, strategyContext: context }),
      });
      const data = await res.json();
      setClarifyQuestion({ field, ...data });
      setClarifyInput('');
      setStep(STEPS.CLARIFYING);
    } catch (err) {
      setError('Failed to get clarification question.');
    }
  };

  // ── Step 3: Handle clarification answer ──
const handleClarifyAnswer = async (answer) => {
    addChat('ai', clarifyQuestion.question, 'question');
    addChat('user', answer);

    const updatedParsed = { ...parsed };
    const field = clarifyQuestion.field;

    // Reference price: use live price if entry is a market order (entryPrice is 0/null),
    // otherwise use the actual stored entry price
    const referencePrice = parsed.entryPrice && parsed.entryPrice > 0
      ? parsed.entryPrice
      : (parsed.livePrice || null);

    const lower = answer.toLowerCase();
    const num = parseFloat(answer.replace(/[^0-9.]/g, ''));

    if (field === 'takeProfitPrice' || field === 'stopLossPrice') {
      // Detect "% above/below entry" style answers
      const isPercentOffset = /%/.test(answer) && /(above|below)\s*entry/.test(lower);

      if (isPercentOffset && referencePrice) {
        const direction = field === 'takeProfitPrice' ? 1 : -1; // TP goes up, SL goes down by default for longs
        const isBelow = /below/.test(lower);
        const sign = isBelow ? -1 : 1;
        const targetPrice = referencePrice * (1 + (sign * num) / 100);
        updatedParsed[field] = parseFloat(targetPrice.toFixed(4));
      } else if (/specific price|set a/.test(lower)) {
        // User chose "Set a specific price" option but didn't give a number yet —
        // ask again as free text (handled by leaving field unset, will re-prompt)
        updatedParsed[field] = null;
      } else if (!isNaN(num)) {
        // Treat as a literal price if it's a plain number with no % sign
        updatedParsed[field] = /%/.test(answer) && referencePrice
          ? parseFloat((referencePrice * (1 + num / 100)).toFixed(4))
          : num;
      } else {
        updatedParsed[field] = answer;
      }
    } else if (field === 'positionSizePercent') {
      updatedParsed[field] = isNaN(num) ? answer : Math.min(num, 100);
    } else if (field === 'positionSizeUSDT') {
      updatedParsed[field] = isNaN(num) ? answer : num;
    } else if (field === 'timeframe') {
      const tfMap = {
        '1 minute': '1m', '1m': '1m',
        '5 minutes': '5m', '5m': '5m',
        '15 minutes': '15m', '15m': '15m',
        '1 hour': '1h', '1h': '1h',
        '4 hours': '4h', '4h': '4h',
        '1 day': '1d', '1d': '1d',
      };
      updatedParsed[field] = tfMap[lower] || answer;
    } else {
      updatedParsed[field] = isNaN(num) ? answer : num;
    }

    const remaining = missingFields.filter((_, i) => i !== currentMissingIndex);
    setParsed(updatedParsed);
    setMissingFields(remaining);

    if (remaining.length > 0) {
      setCurrentMissingIndex(0);
      await fetchClarifyQuestion(remaining[0], updatedParsed);
    } else {
      setStep(STEPS.ANALYSING);
      addChat('ai', 'Perfect. Analysing your strategy now...', 'thinking');
      await runAnalysis(updatedParsed);
    }
  };

  // ── Step 4: Run full risk analysis ──
  const runAnalysis = async (p) => {
    setStep(STEPS.ANALYSING);
    try {
      const res = await fetch(`${API}/api/strategy/analyse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: p }),
      });
      const data = await res.json();
      setAnalysis(data.analysis);
      setChosenStrategy('safer'); // default to safer
      setEditValues(data.analysis.saferStrategy);
      setStep(STEPS.REVIEW);
    } catch (err) {
      setError('Failed to analyse strategy. Please try again.');
      setStep(STEPS.INPUT);
    }
  };

  // ── Step 5: Create the bot ──
  const handleCreateBot = async () => {
    if (!botName.trim()) {
      setError('Please give your bot a name.');
      return;
    }
    setStep(STEPS.CREATING);

    const strategy = editingStrategy
      ? editValues
      : chosenStrategy === 'user'
      ? analysis.userStrategy
      : analysis.saferStrategy;
const botPayload = {
      name: botName,
      strategy: strategyText,
      asset: parsed.asset || 'BTCUSDT',
      timeframe: parsed.timeframe || '1h',
      side: parsed.action === 'sell' ? 'short' : 'long',
      entryPrice: strategy.entryPrice,
      entryType: parsed.entryType || 'limit',
      takeProfit: strategy.takeProfitPrice,
      stopLoss: strategy.stopLossPrice,
      positionSize: strategy.positionSizePercent,
      walletAddress: address,
    };

    try {
      const res = await fetch(`${API}/api/bots/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botPayload),
      });
      if (!res.ok) throw new Error('Failed');
      navigate('/bots');
    } catch (err) {
      setError('Failed to create bot. Please try again.');
      setStep(STEPS.REVIEW);
    }
  };

  const riskColor = {
    low: 'var(--green)',
    medium: '#F59E0B',
    high: 'var(--red)',
  };

  return (
    <div style={{ padding: 20, paddingBottom: 80, maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.1em', fontFamily: 'var(--mono)',
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
      }}>
        Create Strategy
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 5,
            color: 'var(--text-dim)', padding: '4px 10px', fontSize: 10,
            cursor: 'pointer', fontFamily: 'var(--mono)',
          }}
        >
          {showAdvanced ? 'Hide' : 'Advanced Mode'}
        </button>
      </div>

      {/* ── INPUT STEP ── */}
      {step === STEPS.INPUT && (
        <div>
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden', marginBottom: 16,
          }}>
            {/* Terminal header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg3)',
            }}>
              {['#FF5F57','#FFBD2E','#28C840'].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
              ))}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>
                stratex://new-strategy
              </span>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 10,
              }}>
                // Describe your trade in plain English. The AI will handle the rest.
              </div>
              <textarea
                value={strategyText}
                onChange={e => setStrategyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleParse(); }}
                placeholder={`e.g. "Buy BTC at $60k with 10% of my portfolio and sell at $61k"\ne.g. "Short ETH when RSI hits 80, use 5% of portfolio, stop loss at 5%"\ne.g. "Buy SOL now and sell half at $200, rest at $220"`}
                style={{
                  width: '100%', minHeight: 120, background: '#060A10',
                  border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 13,
                  padding: 14, resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box', lineHeight: 1.7,
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Example chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              'Buy BTC at $60k with 10% of my portfolio',
              'Short ETH when RSI hits 80',
              'Buy SOL Now',
            ].map(ex => (
              <button
                key={ex}
                onClick={() => setStrategyText(ex)}
                style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 20, padding: '5px 12px', fontSize: 11,
                  color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)',
                }}
              >
                {ex}
              </button>
            ))}
          </div>

          <button
            onClick={handleParse}
            disabled={!strategyText.trim()}
            style={{
              background: strategyText.trim() ? 'var(--blue)' : 'var(--bg3)',
              color: strategyText.trim() ? '#fff' : 'var(--text-dim)',
              border: 'none', borderRadius: 6, padding: '10px 24px',
              fontSize: 13, fontWeight: 600, cursor: strategyText.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--sans)',
            }}
          >
            Analyse Strategy →
          </button>
        </div>
      )}

      {/* ── CLARIFYING STEP ── */}
      {step === STEPS.CLARIFYING && (
        <div>
          {/* Chat history */}
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatHistory.map(msg => (
              <div key={msg.id} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '75%',
                  background: msg.role === 'user' ? 'var(--blue)' : 'var(--bg2)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '10px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  lineHeight: 1.6,
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Current question */}
            {clarifyQuestion && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  maxWidth: '75%',
                  background: 'var(--bg2)',
                  border: '1px solid var(--blue)',
                  borderRadius: '12px 12px 12px 2px',
                  padding: '12px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--text)',
                  lineHeight: 1.6,
                }}>
                  <div style={{ color: 'var(--blue)', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    STRATEX AI
                  </div>
                  {clarifyQuestion.question}

                  {/* Quick pick options */}
                  {clarifyQuestion.options?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {clarifyQuestion.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleClarifyAnswer(opt)}
                          style={{
                            background: 'var(--bg3)', border: '1px solid var(--border)',
                            borderRadius: 16, padding: '4px 10px', fontSize: 11,
                            color: 'var(--text-mid)', cursor: 'pointer', fontFamily: 'var(--mono)',
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Free text input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={clarifyInput}
              onChange={e => setClarifyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && clarifyInput.trim()) handleClarifyAnswer(clarifyInput.trim()); }}
              placeholder="Or type your own answer..."
              style={{
                flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--mono)',
                fontSize: 12, padding: '10px 14px', outline: 'none',
              }}
            />
            <button
              onClick={() => clarifyInput.trim() && handleClarifyAnswer(clarifyInput.trim())}
              style={{
                background: 'var(--blue)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '10px 18px', fontSize: 13,
                cursor: 'pointer', fontFamily: 'var(--sans)',
              }}
            >
              →
            </button>
          </div>

          <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            {missingFields.length} question{missingFields.length !== 1 ? 's' : ''} remaining
          </div>
        </div>
      )}

      {/* ── ANALYSING STEP ── */}
      {step === STEPS.ANALYSING && (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '2px solid var(--border)', borderTop: '2px solid var(--blue)',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 20px',
          }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-dim)' }}>
            // Analysing your strategy...
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 8, opacity: 0.6 }}>
            Checking risk levels, market conditions, and building a safer alternative
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── REVIEW STEP ── */}
      {step === STEPS.REVIEW && analysis && (
        <div>
          {/* Risk badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '12px 16px', background: 'var(--bg2)',
            border: `1px solid ${riskColor[analysis.riskLevel] || 'var(--border)'}`,
            borderRadius: 8,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: riskColor[analysis.riskLevel],
            }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: riskColor[analysis.riskLevel], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {analysis.riskLevel} Risk
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
              · {analysis.riskReasons?.[0]}
            </span>
          </div>

        {/* Strategy comparison */}
          <div className="strategy-comparison-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {['user', 'safer'].map(type => {
              const s = type === 'user' ? analysis.userStrategy : analysis.saferStrategy;
              const isChosen = chosenStrategy === type;
              const isEditing = editingStrategy === type;

              return (
                <div
                  key={type}
                  onClick={() => { setChosenStrategy(type); setEditingStrategy(null); setEditValues(s); }}
                  style={{
                    background: 'var(--bg2)',
                    border: `1px solid ${isChosen ? 'var(--blue)' : 'var(--border)'}`,
                    borderRadius: 10, padding: 16, cursor: 'pointer',
                    boxShadow: isChosen ? '0 0 20px rgba(27,111,248,0.12)' : 'none',
                    transition: 'all 0.2s',
                    position: 'relative',
                  }}
                >
                  {/* Label */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
                  }}>
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: type === 'safer' ? 'var(--green)' : 'var(--text-dim)',
                    }}>
                      {type === 'user' ? '📝 Your Strategy' : '✦ AI Safer Version'}
                    </div>
                    {isChosen && (
                      <div style={{
                        background: 'var(--blue)', color: '#fff', fontSize: 9,
                        padding: '2px 8px', borderRadius: 10, fontFamily: 'var(--mono)',
                      }}>
                        SELECTED
                      </div>
                    )}
                  </div>

                  {/* Fields — editable if editing */}
                  {[
                    { l: 'Entry', k: 'entryPrice', prefix: '$' },
                    { l: 'Take Profit', k: 'takeProfitPrice', prefix: '$' },
                    { l: 'Stop Loss', k: 'stopLossPrice', prefix: '$' },
                    { l: 'Position Size', k: 'positionSizePercent', suffix: '%' },
                    { l: 'Risk/Reward', k: 'riskRewardRatio', raw: true },
                  ].map(field => (
                    <div key={field.k} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 0', borderBottom: '1px solid rgba(30,45,69,0.4)',
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                        {field.l}
                      </span>
                      {isEditing && !field.raw ? (
                        <input
                          value={editValues[field.k] ?? ''}
                          onChange={e => setEditValues(prev => ({ ...prev, [field.k]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          style={{
                            background: 'var(--bg3)', border: '1px solid var(--blue)',
                            borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--mono)',
                            fontSize: 12, padding: '2px 6px', width: 90, textAlign: 'right',
                          }}
                        />
                      ) : (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                          {field.raw ? s[field.k] : `${field.prefix || ''}${s[field.k]}${field.suffix || ''}`}
                        </span>
                      )}
                    </div>
                  ))}

                  <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                    {s.verdict}
                  </div>

                  {/* Edit / Done toggle */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setChosenStrategy(type);
                      if (isEditing) {
                        setEditingStrategy(null);
                      } else {
                        setEditingStrategy(type);
                        setEditValues(s);
                      }
                    }}
                    style={{
                      marginTop: 12, background: 'none',
                      border: '1px solid var(--border)', borderRadius: 5,
                      color: 'var(--text-dim)', padding: '4px 10px',
                      fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)',
                      width: '100%',
                    }}
                  >
                    {isEditing ? '✓ Done Editing' : '✎ Edit Values'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* AI recommendation */}
          <div style={{
            background: '#060A10', border: '1px solid var(--border)',
            borderRadius: 8, padding: 14, marginBottom: 20,
            fontFamily: 'var(--mono)', fontSize: 11, color: '#7DD3FC', lineHeight: 1.8,
          }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              <span style={{ color: 'var(--blue)' }}>▶</span> QWEN AI · RECOMMENDATION
            </div>
            {analysis.recommendation}
          </div>

          {/* Safer changes list */}
          {analysis.saferStrategy?.changes?.length > 0 && (
            <div style={{
              background: 'rgba(0,214,143,0.04)', border: '1px solid rgba(0,214,143,0.15)',
              borderRadius: 8, padding: 14, marginBottom: 20,
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                What the AI changed
              </div>
              {analysis.saferStrategy.changes.map((c, i) => (
                <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7 }}>
                  · {c}
                </div>
              ))}
            </div>
          )}

          {/* Bot name + create */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Name your bot
            </div>
            <input
              value={botName}
              onChange={e => setBotName(e.target.value)}
              placeholder="e.g. BTC $60K Entry"
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--mono)',
                fontSize: 13, padding: '10px 14px', outline: 'none',
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />
            {error && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginBottom: 10 }}>
                {error}
              </div>
            )}
            <button
              onClick={handleCreateBot}
              style={{
                width: '100%', background: 'var(--blue)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '12px 0',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)',
              }}
            >
              ⚡ Deploy Bot
            </button>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center' }}>
              Using {chosenStrategy === 'user' ? 'your' : "AI's safer"} strategy
              {editingStrategy ? ' (with your edits)' : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATING STEP ── */}
      {step === STEPS.CREATING && (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '2px solid var(--border)', borderTop: '2px solid var(--green)',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 20px',
          }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-dim)' }}>
            // Deploying bot...
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── ADVANCED MODE ── */}
      {showAdvanced && (
        <div style={{
          marginTop: 32, background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Advanced Mode — Manual Strategy Builder
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
            // Use the text input above to describe your strategy. Advanced field editing is available in the review step after the AI parses your strategy.
          </div>
        </div>
      )}

      {error && step === STEPS.INPUT && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginTop: 12 }}>
          {error}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .strategy-comparison-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}