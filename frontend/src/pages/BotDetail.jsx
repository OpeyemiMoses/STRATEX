import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBots } from '../hooks/useBots.js';
import PnLChart from '../components/PnLChart.jsx';
import Badge from '../components/Badge.jsx';
import Toggle from '../components/Toggle.jsx';
import AssetIcon from '../components/AssetIcon.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function BotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bots, toggleBot, deleteBot, refetch } = useBots();
  const [chartRange, setChartRange] = useState('7D');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing] = useState(false);

  const bot = bots.find(b => b.id === id);

const handleClosePosition = async () => {
    if (!window.confirm('Closing will fetch the latest live price, which may differ slightly from what you see now. Continue?')) return;
    setClosing(true);
    try {
      const res = await fetch(`${API}/api/bots/${bot.id}/close`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to close');
      await refetch();
    } catch (err) {
      alert('Failed to close position. Please try again.');
    } finally {
      setClosing(false);
    }
  };

  useEffect(() => {
    if (!bot && bots.length > 0) navigate('/dashboard');
  }, [bot, bots]);

  if (!bot) return (
    <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
      // Loading bot...
    </div>
  );

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteBot(bot.id);
    navigate('/dashboard');
  };

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(30,45,69,0.5)',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: 'var(--text-mid)',
  };

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

  // Real trade log — USER
  const tradelog = bot.tradelog || [];

  return (
    <div style={{ padding: 20 }}>
      <button
        onClick={() => navigate('/dashboard')}
        style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: 13, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', padding: 0 }}
      >
        ← Back to Dashboard
      </button>

      {/* Bot Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
       <div style={{
          width: 44, height: 44, borderRadius: 8,
          background: `${bot.color || '#1B6FF8'}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0, overflow: 'hidden',
        }}>
          <AssetIcon asset={bot.asset} size={28} fallback={bot.emoji || '⚡'} fallbackColor={bot.color || '#1B6FF8'} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{bot.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            {bot.asset} · {bot.timeframe}
          </div>
        </div>
        <Badge status={bot.status} />
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          Created {new Date(bot.createdAt).toLocaleDateString()}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        gap: 16,
      }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

    {/* Current Position */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Current Position
              </div>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 11,
                color: bot.position === 'open' ? 'var(--blue)' : bot.position === 'closed' ? 'var(--text-dim)' : (bot.status === 'active' ? 'var(--green)' : 'var(--text-dim)'),
                background: bot.position === 'open' ? 'rgba(27,111,248,0.1)' : bot.position === 'closed' ? 'var(--bg3)' : (bot.status === 'active' ? 'rgba(0,214,143,0.1)' : 'var(--bg3)'),
                padding: '2px 8px', borderRadius: 4,
              }}>
                {bot.position === 'open' ? 'Position Open' : bot.position === 'closed' ? 'Closed' : (bot.status === 'active' ? 'Waiting to fill' : 'Inactive')}
              </span>
            </div>

            {bot.position === 'open' && bot.unrealizedPnl != null && (
              <div style={{
                marginBottom: 16, padding: '14px 16px',
                background: bot.unrealizedPnl >= 0 ? 'rgba(0,214,143,0.06)' : 'rgba(255,77,106,0.06)',
                border: `1px solid ${bot.unrealizedPnl >= 0 ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'}`,
                borderRadius: 8,
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Unrealized P&L (live)
                </div>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700,
                  color: bot.unrealizedPnl >= 0 ? 'var(--green)' : 'var(--red)',
                }}>
                  {bot.unrealizedPnl >= 0 ? '+' : ''}${bot.unrealizedPnl.toFixed(2)}
                  <span style={{ fontSize: 13, marginLeft: 8, color: bot.unrealizedPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    ({bot.unrealizedPnlPercent >= 0 ? '+' : ''}{bot.unrealizedPnlPercent.toFixed(2)}%)
                  </span>
                </div>
                {bot.lastPrice && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                    Current price: ${bot.lastPrice} · updates every 60s
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { l: bot.position === 'open' || bot.position === 'closed' ? 'Filled Entry' : 'Target Entry', v: bot.filledEntry ? `$${bot.filledEntry}` : (bot.entryPrice ? `$${bot.entryPrice}` : 'Market Price') },
                { l: 'Take Profit', v: bot.takeProfit ? `$${bot.takeProfit}` : '—' },
                { l: 'Stop Loss', v: bot.stopLoss ? `$${bot.stopLoss}` : '—' },
              ].map(m => (
                <div key={m.l}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {m.l}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: m.c || 'var(--text)' }}>
                    {m.v}
                  </div>
                </div>
              ))}
            </div>

            {bot.position === 'open' && (
              <button
                onClick={handleClosePosition}
                disabled={closing}
                style={{
                  marginTop: 16, width: '100%',
                  background: closing ? 'var(--bg3)' : 'var(--blue)',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '10px 0', fontSize: 13, fontWeight: 600,
                  cursor: closing ? 'not-allowed' : 'pointer', fontFamily: 'var(--sans)',
                }}
              >
                {closing ? 'Closing...' : `⚡ Close Position Now ${bot.unrealizedPnl != null ? `(${bot.unrealizedPnl >= 0 ? '+' : ''}$${bot.unrealizedPnl.toFixed(2)})` : ''}`}
              </button>
            )}

            <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              {bot.position === 'open'
                ? '// Simulated position open — monitoring for take profit or stop loss'
                : bot.position === 'closed'
                ? '// Trade complete — bot has stopped'
                : '// Simulated order — bot is monitoring for entry'}
            </div>
          </div>

          {/* Metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}>
            {[
             { l: 'Total P&L', v: `${bot.pnl >= 0 ? '+' : ''}$${bot.pnl?.toFixed(2) ?? '0.00'}${bot.pnlPercent != null ? ` (${bot.pnlPercent >= 0 ? '+' : ''}${bot.pnlPercent.toFixed(2)}%)` : ''}`, c: bot.pnl >= 0 ? 'var(--green)' : 'var(--red)' },
              { l: 'Win Rate', v: `${bot.winRate?.toFixed(1) ?? '0.0'}%`, c: 'var(--text)' },
              { l: 'Total Trades', v: bot.trades ?? 0, c: 'var(--text)' },
            ].map(m => (
              <div key={m.l} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  {m.l}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: m.c }}>
                  {m.v}
                </div>
              </div>
            ))}
          </div>

          {/* Trade Log */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Trade Log
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Time', 'Side', 'Price', 'Size', 'P&L'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
             <tbody>
                {tradelog.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', padding: '30px 12px', color: 'var(--text-dim)' }}>
                      // No trades yet — order execution coming soon
                    </td>
                  </tr>
                ) : (
                  tradelog.map((t, i) => (
                    <tr
                      key={i}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,111,248,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={tdStyle}>{t.time}</td>
                      <td style={{ ...tdStyle, color: t.side === 'Long' ? 'var(--green)' : 'var(--red)' }}>{t.side}</td>
                      <td style={tdStyle}>{t.price}</td>
                      <td style={tdStyle}>{t.size}</td>
                      <td style={{ ...tdStyle, color: 'var(--green)' }}>{t.pnl}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* PnL Chart */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                P&L Chart
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['1D', '7D', '30D', 'All'].map(r => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    style={{
                      background: chartRange === r ? 'transparent' : 'transparent',
                      color: chartRange === r ? 'var(--blue)' : 'var(--text-dim)',
                      border: chartRange === r ? '1px solid var(--blue)' : '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <PnLChart height={120} />
          </div>

          {/* Strategy Summary */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Strategy Settings
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
           {[
                { l: 'Asset', v: bot.asset },
                { l: 'Timeframe', v: bot.timeframe },
                { l: 'Entry Price', v: bot.entryPrice ? `$${bot.entryPrice}` : '—' },
                { l: 'Stop Loss', v: bot.stopLoss ? `$${bot.stopLoss}` : '—' },
                { l: 'Take Profit', v: bot.takeProfit ? `$${bot.takeProfit}` : '—' },
                { l: 'Position Size', v: bot.positionSize ? `${bot.positionSize}% of balance` : '—' },
              ].map(m => (
                <div key={m.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(30,45,69,0.5)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{m.l}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>{m.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Pause toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>
                {bot.status === 'active' ? 'Bot is running' : 'Bot is paused'}
              </span>
              <Toggle
                checked={bot.status === 'active'}
                onChange={() => toggleBot(bot.id)}
              />
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Delete */}
            <button
              onClick={handleDelete}
              style={{
                background: 'transparent',
                color: confirmDelete ? 'var(--red)' : 'var(--text-dim)',
                border: `1px solid ${confirmDelete ? 'rgba(255,77,106,0.4)' : 'var(--border)'}`,
                borderRadius: 6,
                padding: '9px 16px',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
                width: '100%',
                transition: 'all 0.15s',
              }}
            >
              {confirmDelete ? '⚠️ Confirm Delete' : '🗑 Delete Bot'}
            
            </button>
          </div>
           <div style={{ padding: 20, paddingBottom: 20 }}></div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 300px"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="grid-template-columns: repeat(3, 1fr)"] {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}