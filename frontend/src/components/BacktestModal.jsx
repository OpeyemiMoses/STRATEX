import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PnLChart from './PnLChart.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function BacktestModal({ bot, onClose }) {
  const [results, setResults] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(true);

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
    try {
      const btRes = await fetch(`${API}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: bot.strategy,
          asset: bot.asset,
          timeframe: bot.timeframe,
          stopLoss: bot.stopLoss,
          takeProfit: bot.takeProfit,
          positionSize: bot.positionSize,
        }),
      });
      const btData = await btRes.json();
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
              {bot.asset} · {bot.timeframe} · Live Backtest Analysis
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
            // Running analysis on {bot.asset}...
          </div>
        ) : (
          <>
            {/* Metrics Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}>
              {[
                { l: 'Total Return', v: `${results?.metrics?.totalReturn >= 0 ? '+' : ''}${results?.metrics?.totalReturn}%`, c: results?.metrics?.totalReturn >= 0 ? 'var(--green)' : 'var(--red)' },
                { l: 'Win Rate', v: `${results?.metrics?.winRate}%`, c: 'var(--green)' },
                { l: 'Sharpe Ratio', v: results?.metrics?.sharpeRatio, c: 'var(--text)' },
                { l: 'Max Drawdown', v: `${results?.metrics?.maxDrawdown}%`, c: 'var(--red)' },
                { l: 'Total Trades', v: results?.metrics?.totalTrades, c: 'var(--text)' },
                { l: 'Profit Factor', v: results?.metrics?.profitFactor, c: 'var(--green)' },
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

            {/* PnL Chart */}
            <div style={{ marginBottom: 16 }}>
              <PnLChart data={results?.chartData} height={130} />
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