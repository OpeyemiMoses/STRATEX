import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBots } from '../hooks/useBots.js';

const REGIME_BADGE_COLOR = {
  bull: 'var(--green)',
  bear: 'var(--red)',
  sideways: 'var(--text-dim)',
  high_volatility: '#F59E0B',
  unknown: 'var(--text-dim)',
};

export default function BacktestResults() {
  const navigate = useNavigate();
  const { createBot } = useBots();
  const [results, setResults] = useState(null);
  const [settings, setSettings] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [expandedRegime, setExpandedRegime] = useState(null);

  useEffect(() => {
    const r = sessionStorage.getItem('backtestResults');
    const s = sessionStorage.getItem('strategySettings');
    if (!r || !s) { navigate('/create'); return; }
    setResults(JSON.parse(r));
    setSettings(JSON.parse(s));
  }, []);

  const handleDeploy = async () => {
    setDeploying(true);
    const bot = await createBot({
      name: settings.name,
      asset: settings.asset,
      timeframe: settings.timeframe,
      strategy: settings.strategy,
      stopLoss: settings.stopLoss,
      takeProfit: settings.takeProfit,
      positionSize: settings.positionSize,
      leverage: settings.leverage,
      backtestResults: results,
      emoji: settings.emoji,
      color: settings.color,
      pnl: 0,
      // NOTE: was results?.metrics?.winRate -- the real backtest response no
      // longer has a flat `metrics` object, it's `aggregateMetrics`.
      winRate: results?.aggregateMetrics?.winRate || 0,
      trades: 0,
    });
    setDeploying(false);
    if (bot) navigate('/dashboard');
  };

  if (!results || !settings) return null;

  // NOTE: the real backtest engine's response shape is different from the
  // old mock -- there is no top-level `metrics`, `trades`, or `chartData`
  // anymore. Aggregate numbers live in `aggregateMetrics`, and the real
  // per-trade detail lives inside each entry of `regimes[]` (last 10 trades
  // per regime, by design -- see backtest.js). There is also no single
  // equity curve to chart here since performance is now reported per
  // regime rather than as one continuous timeline.
  const { aggregateMetrics, robustnessScore, verdict, regimes, startingBalance } = results;

  const thStyle = {
    padding: '8px 12px',
    textAlign: 'left',
    color: 'var(--text-dim)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    borderBottom: '1px solid var(--border)',
    fontWeight: 500,
    fontFamily: 'var(--mono)',
  };

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(30,45,69,0.5)',
    color: 'var(--text-mid)',
    fontFamily: 'var(--mono)',
    fontSize: 12,
  };

  return (
    <div style={{ padding: 20 }}>
      <button
        onClick={() => navigate('/create')}
        style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: 13, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', padding: 0 }}
      >
        ← Back
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{settings.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
            {settings.asset} · {settings.timeframe} &nbsp;·&nbsp; Tested against {regimes?.length || 0} real historical regimes
          </div>
        </div>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          style={{
            background: 'var(--blue)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '9px 20px',
            fontSize: 13,
            fontWeight: 500,
            cursor: deploying ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--sans)',
          }}
        >
          {deploying ? '⏳ Deploying...' : '▶ Deploy Bot'}
        </button>
      </div>

      {/* Robustness + Aggregate Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 260px',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* Robustness verdict */}
        <div style={{
          background: 'var(--bg2)',
          border: `1px solid ${robustnessScore >= 60 ? 'rgba(0,214,143,0.25)' : 'rgba(255,77,106,0.25)'}`,
          borderRadius: 8,
          padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Robustness Score
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700,
              color: robustnessScore >= 60 ? 'var(--green)' : robustnessScore >= 30 ? '#F59E0B' : 'var(--red)',
            }}>
              {robustnessScore}/100
            </div>
          </div>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.7, margin: 0 }}>
            {verdict}
          </p>
        </div>

        {/* Key Metrics */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Aggregate Metrics
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { l: 'Total Return', v: `${aggregateMetrics.totalReturn >= 0 ? '+' : ''}${aggregateMetrics.totalReturn}%`, c: aggregateMetrics.totalReturn >= 0 ? 'var(--green)' : 'var(--red)' },
              { l: 'Sharpe Ratio', v: aggregateMetrics.sharpeRatio, c: 'var(--text)' },
              { l: 'Win Rate', v: `${aggregateMetrics.winRate}%`, c: 'var(--green)' },
              { l: 'Max Drawdown', v: `${aggregateMetrics.maxDrawdown}%`, c: 'var(--red)' },
              { l: 'Total Trades', v: aggregateMetrics.totalTrades, c: 'var(--text)' },
              { l: 'Profit Factor', v: aggregateMetrics.profitFactor ?? '—', c: 'var(--green)' },
            ].map((m, i) => (
              <div key={m.l} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < 5 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{m.l}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: m.c }}>{m.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-Regime Breakdown — replaces the old single equity-curve chart,
          since performance now genuinely differs by market condition rather
          than being one smoothed-over timeline */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Performance by Market Regime
          </div>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {regimes?.map((regime, i) => {
            const isExpanded = expandedRegime === i;
            const isProfit = regime.metrics.totalReturn >= 0;
            return (
              <div
                key={i}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}
              >
                <div
                  onClick={() => setExpandedRegime(isExpanded ? null : i)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}
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
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: isProfit ? 'var(--green)' : 'var(--red)' }}>
                      {isProfit ? '+' : ''}{regime.metrics.totalReturn}%
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ overflowX: 'auto', marginTop: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                        <thead>
                          <tr>
                            {['Entry', 'Exit', 'P&L (USDT)', 'P&L %', 'Outcome'].map(h => (
                              <th key={h} style={thStyle}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {regime.trades.map((t, ti) => (
                            <tr key={ti}>
                              <td style={tdStyle}>{Number(t.entryPrice).toLocaleString()}</td>
                              <td style={tdStyle}>{Number(t.exitPrice).toLocaleString()}</td>
                              <td style={{ ...tdStyle, color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                              </td>
                              <td style={{ ...tdStyle, color: t.pnlPercent >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                              </td>
                              <td style={{ ...tdStyle, color: t.outcome === 'liquidation' ? '#F59E0B' : 'var(--text-mid)' }}>
                                {t.outcome.replace(/_/g, ' ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 260px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}