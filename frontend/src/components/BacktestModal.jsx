import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const REGIME_BADGE_COLOR = {
  bull: 'var(--green)',
  bear: 'var(--red)',
  sideways: 'var(--text-dim)',
  high_volatility: '#F59E0B',
  unknown: 'var(--text-dim)',
};

export default function BacktestModal({ bot, onClose }) {
  const [results, setResults] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRegime, setExpandedRegime] = useState(null);

  useEffect(() => {
    if (bot) runAnalysis();
  }, [bot]);

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    setResults(null);
    setAnalysis('');
    setError('');
    try {
      // FIXED: the old request was missing side, entryType, entryPrice, and
      // leverage -- the real backtest engine needs all of these to replay
      // the strategy correctly. Without them it would silently default to
      // long/market/1x regardless of how this bot was actually configured,
      // producing results that don't match the bot's real behavior.
      const btRes = await fetch(`${API}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: bot.strategy,
          asset: bot.asset,
          timeframe: bot.timeframe,
          side: bot.side,
          entryType: bot.entryType,
          entryPrice: bot.entryPrice,
          stopLoss: bot.stopLoss,
          takeProfit: bot.takeProfit,
          positionSize: bot.positionSize,
          leverage: bot.leverage,
        }),
      });
      const btData = await btRes.json();

      if (!btRes.ok) {
        setError(btData.error || 'Backtest failed.');
        return;
      }
      setResults(btData);

      const analysisRes = await fetch(`${API}/api/strategy/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot, backtestResults: btData }),
      });
      const analysisData = await analysisRes.json();
      setAnalysis(analysisData.analysis || '');
    } catch (err) {
      console.error('Backtest modal error:', err);
      setError('Backtest failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '40px 20px',
      overflowY: 'auto',
    }}>
      {/* Blur overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(7,10,15,0.88)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      />

      {/* Modal - centered, scrollable */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 860,
        background: 'var(--bg1)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 24,
        zIndex: 1001,
        boxShadow: '0 0 60px rgba(27,111,248,0.15)',
        animation: 'modalRise 0.3s ease forwards',
        marginBottom: 40,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{bot.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {bot.asset} · {bot.timeframe} · Multi-Regime Backtest
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-mid)',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          >
            ✕ Close
          </button>
        </div>

        {loading ? (
          <div style={{
            padding: '60px 40px',
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--text-dim)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid var(--border)',
              borderTop: '2px solid var(--blue)',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            // Replaying strategy against real historical data for {bot.asset}...
          </div>
        ) : error ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            color: 'var(--red)',
          }}>
            {error}
          </div>
        ) : (
          <>
            {/* Aggregate Metrics Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}>
              {[
                { l: 'Total Return', v: `${results?.aggregateMetrics?.totalReturn >= 0 ? '+' : ''}${results?.aggregateMetrics?.totalReturn}%`, c: results?.aggregateMetrics?.totalReturn >= 0 ? 'var(--green)' : 'var(--red)' },
                { l: 'Win Rate', v: `${results?.aggregateMetrics?.winRate}%`, c: 'var(--green)' },
                { l: 'Sharpe Ratio', v: results?.aggregateMetrics?.sharpeRatio, c: 'var(--text)' },
                { l: 'Max Drawdown', v: `${results?.aggregateMetrics?.maxDrawdown}%`, c: 'var(--red)' },
                { l: 'Total Trades', v: results?.aggregateMetrics?.totalTrades, c: 'var(--text)' },
                { l: 'Profit Factor', v: results?.aggregateMetrics?.profitFactor ?? '—', c: 'var(--green)' },
              ].map(m => (
                <div key={m.l} style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 12px',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{m.l}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>

            {/* Robustness Score + Verdict — the actual point of multi-regime testing */}
            <div style={{
              background: 'var(--bg2)',
              border: `1px solid ${results?.robustnessScore >= 60 ? 'rgba(0,214,143,0.25)' : 'rgba(255,77,106,0.25)'}`,
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Robustness Score
                </span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700,
                  color: results?.robustnessScore >= 60 ? 'var(--green)' : results?.robustnessScore >= 30 ? '#F59E0B' : 'var(--red)',
                }}>
                  {results?.robustnessScore}/100
                </span>
              </div>
              <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.7, margin: 0 }}>
                {results?.verdict}
              </p>
            </div>

            {/* Per-Regime Breakdown */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Performance by Market Regime
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results?.regimes?.map((regime, i) => {
                  const isExpanded = expandedRegime === i;
                  const isProfit = regime.metrics.totalReturn >= 0;
                  return (
                    <div
                      key={i}
                      style={{
                        background: 'var(--bg2)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => setExpandedRegime(isExpanded ? null : i)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 10,
                            color: REGIME_BADGE_COLOR[regime.label] || 'var(--text-dim)',
                            border: `1px solid ${REGIME_BADGE_COLOR[regime.label] || 'var(--border)'}`,
                            borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase',
                          }}>
                            {regime.labelDisplay}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                            {regime.metrics.totalTrades} trade{regime.metrics.totalTrades !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
                            color: isProfit ? 'var(--green)' : 'var(--red)',
                          }}>
                            {isProfit ? '+' : ''}{regime.metrics.totalReturn}%
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                            gap: 8, marginTop: 10, marginBottom: 10,
                          }}>
                            {[
                              { l: 'Win Rate', v: `${regime.metrics.winRate}%` },
                              { l: 'Max DD', v: `${regime.metrics.maxDrawdown}%` },
                              { l: 'Sharpe', v: regime.metrics.sharpeRatio },
                              { l: 'Profit Factor', v: regime.metrics.profitFactor ?? '—' },
                            ].map(m => (
                              <div key={m.l}>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>{m.l}</div>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                          {regime.regimeStats && (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                              Price move: {regime.regimeStats.netChangePercent?.toFixed(1)}% · Annualized vol: {regime.regimeStats.annualizedVolPercent?.toFixed(0)}%
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Qwen Analysis */}
            <div style={{
              background: '#060A10',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 16,
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: '#7DD3FC',
              lineHeight: 1.9,
              whiteSpace: 'pre-wrap',
              minHeight: 120,
            }}>
              <div style={{
                fontSize: 10,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ color: 'var(--blue)' }}>▶</span> QWEN_AI · BOT ANALYSIS
              </div>
              {analysis || '// Analysis complete.'}
            </div>

            {/* Verdict Banner */}
            {analysis && (
              <div style={{
                marginTop: 12,
                padding: '12px 16px',
                borderRadius: 6,
                background: analysis.includes('KEEP RUNNING')
                  ? 'rgba(0,214,143,0.06)'
                  : analysis.includes('STOP')
                  ? 'rgba(255,77,106,0.06)'
                  : 'rgba(27,111,248,0.06)',
                border: `1px solid ${
                  analysis.includes('KEEP RUNNING')
                    ? 'rgba(0,214,143,0.2)'
                    : analysis.includes('STOP')
                    ? 'rgba(255,77,106,0.2)'
                    : 'rgba(27,111,248,0.2)'
                }`,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: analysis.includes('KEEP RUNNING')
                  ? 'var(--green)'
                  : analysis.includes('STOP')
                  ? 'var(--red)'
                  : 'var(--blue)',
                lineHeight: 1.6,
              }}>
                ✦ {analysis.includes('KEEP RUNNING')
                  ? 'Verdict: Keep this bot running based on current analysis.'
                  : analysis.includes('STOP')
                  ? 'Verdict: Consider stopping this bot — performance is below threshold.'
                  : 'Verdict: Review the analysis above and decide whether to keep this bot running.'}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes modalRise {
          0% { opacity: 0; transform: translateY(20px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>,
    document.body
  );
}