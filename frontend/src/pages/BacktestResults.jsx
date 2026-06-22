import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBots } from '../hooks/useBots.js';
import PnLChart from '../components/PnLChart.jsx';

export default function BacktestResults() {
  const navigate = useNavigate();
  const { createBot } = useBots();
  const [results, setResults] = useState(null);
  const [settings, setSettings] = useState(null);
  const [deploying, setDeploying] = useState(false);

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
      backtestResults: results,
      emoji: settings.emoji,
      color: settings.color,
      pnl: 0,
      winRate: results?.metrics?.winRate || 0,
      trades: 0,
    });
    setDeploying(false);
    if (bot) navigate('/dashboard');
  };

  if (!results || !settings) return null;

  const { metrics, trades, chartData } = results;

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
            {settings.asset} · {settings.timeframe} &nbsp;·&nbsp; {results.period}
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

      {/* Chart + Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 260px',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* PnL Chart */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            P&L Performance
          </div>
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 28,
            fontWeight: 700,
            color: metrics.totalReturn >= 0 ? 'var(--green)' : 'var(--red)',
            marginBottom: 12,
          }}>
            {metrics.totalReturn >= 0 ? '+' : ''}{metrics.totalReturn}%
          </div>
          <PnLChart data={chartData} height={140} />
        </div>

        {/* Key Metrics */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Key Metrics
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { l: 'Sharpe Ratio', v: metrics.sharpeRatio, c: 'var(--text)' },
              { l: 'Win Rate', v: `${metrics.winRate}%`, c: 'var(--green)' },
              { l: 'Max Drawdown', v: `${metrics.maxDrawdown}%`, c: 'var(--red)' },
              { l: 'Total Trades', v: metrics.totalTrades, c: 'var(--text)' },
              { l: 'Profit Factor', v: metrics.profitFactor, c: 'var(--green)' },
            ].map((m, i) => (
              <div key={m.l} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{m.l}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: m.c }}>{m.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trade History */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Trade History
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Type', 'Entry', 'Exit', 'P&L (USDT)', 'P&L %', 'Date'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr
                  key={t.id}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,111,248,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}>{t.id}</td>
                  <td style={{ ...tdStyle, color: t.type === 'Long' ? 'var(--green)' : 'var(--red)' }}>{t.type}</td>
                  <td style={tdStyle}>{parseFloat(t.entry).toLocaleString()}</td>
                  <td style={tdStyle}>{parseFloat(t.exit).toLocaleString()}</td>
                  <td style={{ ...tdStyle, color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                  </td>
                  <td style={{ ...tdStyle, color: t.pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                  </td>
                  <td style={tdStyle}>{t.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
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