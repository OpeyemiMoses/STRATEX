import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useBots } from '../hooks/useBots.js';
import { useMarkets } from '../hooks/useMarkets.js';
import BotCard from '../components/BotCard.jsx';
import WalletBalance from '../components/WalletBalance.jsx';
import AssetIcon from '../components/AssetIcon.jsx';
import TrendingCoins from '../components/TrendingCoins.jsx';
import CoinTable from '../components/CoinTable.jsx';
import WhaleEvents from '../components/WhaleEvents.jsx';
import Toggle from '../components/Toggle.jsx';
import Badge from '../components/Badge.jsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const { address } = useAccount();
 const { bots, loading, toggleBot } = useBots();
  const visibleBots = bots.filter(b => b.status !== 'closed');
  const { memes, l1s, l2s, loading: marketsLoading } = useMarkets();
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('grid');
  const [marketTab, setMarketTab] = useState('l1');

  const filtered = tab === 'all' ? visibleBots : visibleBots.filter(b => b.status === tab);

  const totalPnL = visibleBots.reduce((acc, b) => acc + (b.position === 'open' ? (b.unrealizedPnl || 0) : (b.pnl || 0)), 0);
  const activeBots = visibleBots.filter(b => b.status === 'active').length;
  const avgWinRate = visibleBots.length > 0
    ? (visibleBots.reduce((acc, b) => acc + (b.winRate || 0), 0) / visibleBots.length).toFixed(1)
    : 0;
  const totalTrades = visibleBots.reduce((acc, b) => acc + (b.trades || 0), 0);

  return (
    <div style={{ padding: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Dashboard</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
          </div>
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

     {/* Wallet Balance */}
      <WalletBalance bots={bots} />

      {/* Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        {[
          { label: 'Total P&L', value: `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`, unit: null, color: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Active Bots', value: activeBots, unit: `of ${bots.length}`, color: 'var(--text)' },
          { label: 'Avg Win Rate', value: `${avgWinRate}%`, unit: null, color: 'var(--text)' },
          { label: 'Total Trades', value: totalTrades, unit: null, color: 'var(--text)' },
        ].map(m => (
          <div
            key={m.label}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
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
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {m.label}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: m.color }}>
              {m.value}
              {m.unit && <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4 }}>{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Trending Coins */}
      <TrendingCoins />

      {/* Bots Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Your Bots
        </div>
    <div className="view-toggle-buttons" style={{ display: 'flex', gap: 8 }}>
          {['grid', 'list'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? 'var(--bg3)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                color: view === v ? 'var(--text)' : 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bot Tabs */}
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
           <span style={{ marginLeft: 6, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 10, fontSize: 10 }}>
              {t === 'all' ? visibleBots.length : visibleBots.filter(b => b.status === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Bot List/Grid */}
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
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
            // No bots yet. Create your first strategy.
          </div>
          <button
            onClick={() => navigate('/create')}
            style={{
              background: 'var(--blue)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '8px 20px', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--sans)',
            }}
          >
            + Create Strategy
          </button>
        </div>
   ) : view === 'grid' ? (
        <div className="dashboard-grid-view" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}>
          {filtered.map(bot => (
            <BotCard key={bot.id} bot={bot} onToggle={toggleBot} />
          ))}
        </div>
      ) : (
        <div className="dashboard-list-view" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20 }}>
          {filtered.map(bot => (
           <div
              key={bot.id}
              onClick={() => navigate(`/bot/${bot.id}`)}
              className="dashboard-list-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 120px 110px 90px 80px 60px',
                padding: '12px 16px',
                borderBottom: '1px solid rgba(30,45,69,0.5)',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,111,248,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
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
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{bot.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{bot.asset} · {bot.timeframe}</div>
                </div>
              </div>
              <Badge status={bot.status} />
             <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: (bot.position === 'open' ? bot.unrealizedPnl : bot.pnl) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {bot.position === 'open'
                  ? `${bot.unrealizedPnl >= 0 ? '+' : ''}$${bot.unrealizedPnl?.toFixed(2) ?? '0.00'}`
                  : `${bot.pnl >= 0 ? '+' : ''}$${bot.pnl?.toFixed(2) ?? '0.00'}`}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>
                {bot.winRate?.toFixed(1) ?? '0.0'}%
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>
                {bot.trades ?? 0}
              </div>
              <Toggle
                checked={bot.status === 'active'}
                onChange={e => { e.stopPropagation(); toggleBot(bot.id); }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Market Data Section */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        Market Data <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Market Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[
          { id: 'l1', label: 'L1 Coins' },
          { id: 'l2', label: 'L2 Coins' },
          { id: 'meme', label: 'Meme Coins' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setMarketTab(t.id)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: marketTab === t.id ? 'var(--blue)' : 'var(--text-dim)',
              borderBottom: marketTab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              borderBottom: marketTab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {marketTab === 'l1' && <CoinTable coins={l1s} title="Layer 1 Blockchains" icon="⛓️" />}
      {marketTab === 'l2' && <CoinTable coins={l2s} title="Layer 2 Networks" icon="🔷" />}
      {marketTab === 'meme' && <CoinTable coins={memes} title="Meme Coins" icon="🐸" />}
{/* Whale Events */}
      <WhaleEvents />
       <div style={{ padding: 20, paddingBottom: 20 }}></div>

      <style>{`
        @media (max-width: 768px) {
          .view-toggle-buttons {
            display: none !important;
          }
          .dashboard-list-view {
            display: none !important;
          }
          .dashboard-grid-view {
            display: grid !important;
          }
        }
      `}</style>
    </div>
  );
}