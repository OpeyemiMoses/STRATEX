import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBots } from '../hooks/useBots.js';
import Badge from '../components/Badge.jsx';
import Toggle from '../components/Toggle.jsx';
import BacktestModal from '../components/BacktestModal.jsx';
import AssetIcon from '../components/AssetIcon.jsx';

export default function Bots() {
  const navigate = useNavigate();
  const { bots, loading, toggleBot, deleteBot } = useBots();
  const [tab, setTab] = useState('all');
  const [selectedBot, setSelectedBot] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const filtered = tab === 'all' ? bots : bots.filter(b => b.status === tab);

  const handleBacktest = (e, bot) => {
    e.stopPropagation();
    setSelectedBot(bot);
    setShowModal(true);
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
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ padding: 20, paddingBottom: 80 }} className="page-with-mobile-nav">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--mono)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          Bot Management
          <div style={{ width: 200, height: 1, background: 'var(--border)' }} />
        </div>
        <button
          onClick={() => navigate('/create')}
          style={{
            background: 'var(--blue)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
          }}
        >
          + New Strategy
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        {[
          { l: 'Total Bots', v: bots.length, c: 'var(--text)' },
          { l: 'Active', v: bots.filter(b => b.status === 'active').length, c: 'var(--green)' },
          { l: 'Paused', v: bots.filter(b => b.status === 'paused').length, c: 'var(--yellow)' },
        ].map(m => (
          <div key={m.l} style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 14,
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--blue)';
              e.currentTarget.style.boxShadow = '0 0 20px var(--blue-glow)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{m.l}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {['all', 'active', 'paused'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: tab === t ? 'var(--blue)' : 'var(--text-dim)',
              borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span style={{
              marginLeft: 6,
              background: 'var(--bg3)',
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10,
            }}>
              {t === 'all' ? bots.length : bots.filter(b => b.status === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Bots Table */}
      {loading ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>
          // Loading bots...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
            // No bots in this category.
          </div>
          <button
            onClick={() => navigate('/create')}
            style={{
              background: 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            + Create Strategy
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  {['Bot', 'Asset', 'Status', 'P&L', 'Win Rate', 'Trades', 'Created', 'Active', 'Actions'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(bot => (
                  <tr
                    key={bot.id}
                    onClick={() => navigate(`/bot/${bot.id}`)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,111,248,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                   {/* Bot name */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 6,
                          background: `${bot.color || '#1B6FF8'}22`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, flexShrink: 0, overflow: 'hidden',
                        }}>
                          <AssetIcon asset={bot.asset} size={20} fallback={bot.emoji || '⚡'} fallbackColor={bot.color || '#1B6FF8'} />
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                          {bot.name}
                        </div>
                      </div>
                    </td>

                    {/* Asset */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                      {bot.asset} · {bot.timeframe}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)' }}>
                      <Badge status={bot.status} />
                    </td>

                  {/* P&L */}
                    <td style={{
                      padding: '12px',
                      borderBottom: '1px solid rgba(30,45,69,0.5)',
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      color: (bot.position === 'open' ? bot.unrealizedPnl : bot.pnl) >= 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {bot.position === 'open' ? (
                        <>
                          {bot.unrealizedPnl >= 0 ? '+' : ''}${bot.unrealizedPnl?.toFixed(2) ?? '0.00'}
                          <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>(live)</span>
                        </>
                      ) : (
                        <>
                          {bot.pnl >= 0 ? '+' : ''}${bot.pnl?.toFixed(2) ?? '0.00'}
                          {bot.pnlPercent != null && (
                            <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>
                              ({bot.pnlPercent >= 0 ? '+' : ''}{bot.pnlPercent.toFixed(2)}%)
                            </span>
                          )}
                        </>
                      )}
                    </td>

                    {/* Win Rate */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>
                      {bot.winRate?.toFixed(1) ?? '0.0'}%
                    </td>

                    {/* Trades */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>
                      {bot.trades ?? 0}
                    </td>

                    {/* Created */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                      {new Date(bot.createdAt).toLocaleDateString()}
                    </td>

                    {/* Toggle */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)' }}>
                      <Toggle
                        checked={bot.status === 'active'}
                        onChange={e => { e.stopPropagation(); toggleBot(bot.id); }}
                      />
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px', borderBottom: '1px solid rgba(30,45,69,0.5)' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={e => handleBacktest(e, bot)}
                          style={{
                            background: 'transparent',
                            color: 'var(--blue)',
                            border: '1px solid var(--blue)',
                            borderRadius: 5,
                            padding: '4px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontFamily: 'var(--mono)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ▶ Backtest
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteBot(bot.id); }}
                          style={{
                            background: 'transparent',
                            color: 'var(--red)',
                            border: '1px solid rgba(255,77,106,0.3)',
                            borderRadius: 5,
                            padding: '4px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontFamily: 'var(--mono)',
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
             </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="bots-mobile-cards">
            {filtered.map(bot => (
              <div
                key={bot.id}
                onClick={() => navigate(`/bot/${bot.id}`)}
                style={{
                  padding: 14,
                  borderBottom: '1px solid rgba(30,45,69,0.5)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 6,
                      background: `${bot.color || '#1B6FF8'}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0, overflow: 'hidden',
                    }}>
                      <AssetIcon asset={bot.asset} size={20} fallback={bot.emoji || '⚡'} fallbackColor={bot.color || '#1B6FF8'} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{bot.name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>{bot.asset} · {bot.timeframe}</div>
                    </div>
                  </div>
                  <Badge status={bot.status} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>P&L</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: (bot.position === 'open' ? bot.unrealizedPnl : bot.pnl) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {bot.position === 'open'
                        ? `${bot.unrealizedPnl >= 0 ? '+' : ''}$${bot.unrealizedPnl?.toFixed(2) ?? '0.00'}`
                        : `${bot.pnl >= 0 ? '+' : ''}$${bot.pnl?.toFixed(2) ?? '0.00'}`}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>Win Rate</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>{bot.winRate?.toFixed(1) ?? '0.0'}%</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>Trades</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>{bot.trades ?? 0}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Toggle
                    checked={bot.status === 'active'}
                    onChange={e => { e.stopPropagation(); toggleBot(bot.id); }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={e => handleBacktest(e, bot)}
                      style={{
                        background: 'transparent', color: 'var(--blue)', border: '1px solid var(--blue)',
                        borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--mono)',
                      }}
                    >
                      ▶ Backtest
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteBot(bot.id); }}
                      style={{
                        background: 'transparent', color: 'var(--red)', border: '1px solid rgba(255,77,106,0.3)',
                        borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--mono)',
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .bots-mobile-cards { display: none; }
        @media (max-width: 768px) {
          .bots-mobile-cards { display: block; }
          table { display: none; }
        }
      `}</style>

      {/* Backtest Modal */}
      {showModal && selectedBot && (
        <BacktestModal
          bot={selectedBot}
          onClose={() => { setShowModal(false); setSelectedBot(null); }}
        />
      )}
    </div>
  );
}