import { useNavigate } from 'react-router-dom';
import Badge from './Badge.jsx';
import MiniChart from './MiniChart.jsx';
import Toggle from './Toggle.jsx';
import AssetIcon from './AssetIcon.jsx';

export default function BotCard({ bot, onToggle, disableToggle = false }) {
  const navigate = useNavigate();
  const isLong = bot.side !== 'short';
  const hasLeverage = bot.leverage && bot.leverage > 1;

  return (
    <div
      onClick={() => navigate(`/bot/${bot.id}`)}
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
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
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: `${bot.color || '#1B6FF8'}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <AssetIcon
              asset={bot.asset}
              size={22}
              fallback={bot.emoji || '⚡'}
              fallbackColor={bot.color || '#1B6FF8'}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
              {bot.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text-dim)',
              }}
            >
              {bot.asset} · {bot.timeframe}
            </div>
          </div>
        </div>

        <Toggle
          checked={bot.status === 'active'}
          disabled={disableToggle}
          onChange={e => {
            e.stopPropagation();

            if (disableToggle) return;

            onToggle(bot.id);
          }}
        />
      </div>

      {/* Direction + leverage badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            fontWeight: 700,
            color: isLong ? 'var(--green)' : 'var(--red)',
            background: isLong
              ? 'rgba(0,214,143,0.1)'
              : 'rgba(255,77,106,0.1)',
            border: `1px solid ${
              isLong
                ? 'rgba(0,214,143,0.3)'
                : 'rgba(255,77,106,0.3)'
            }`,
            padding: '2px 7px',
            borderRadius: 4,
          }}
        >
          {isLong ? '▲ LONG' : '▼ SHORT'}
        </span>

        {hasLeverage && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              fontWeight: 700,
              color: '#F59E0B',
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              padding: '2px 7px',
              borderRadius: 4,
            }}
          >
            {bot.leverage}x
          </span>
        )}

        {bot.position === 'open' && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--blue)',
              background: 'rgba(27,111,248,0.1)',
              border: '1px solid rgba(27,111,248,0.3)',
              padding: '2px 7px',
              borderRadius: 4,
            }}
          >
            ● LIVE
          </span>
        )}
      </div>

      <MiniChart positive={bot.pnl >= 0} height={40} />

      {/* Metrics */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              fontFamily: 'var(--mono)',
              marginBottom: 2,
            }}
          >
            P&L
            {bot.position === 'open' && hasLeverage
              ? ` (${bot.leverage}x)`
              : ''}
          </div>

          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 14,
              fontWeight: 600,
              color:
                (bot.position === 'open'
                  ? bot.unrealizedPnl
                  : bot.pnl) >= 0
                  ? 'var(--green)'
                  : 'var(--red)',
            }}
          >
            {bot.position === 'open'
              ? `${(bot.unrealizedPnl ?? 0) >= 0 ? '+' : ''}$${(
                  bot.unrealizedPnl ?? 0
                ).toFixed(2)} (live)`
              : `${(bot.pnl ?? 0) >= 0 ? '+' : ''}$${(
                  bot.pnl ?? 0
                ).toFixed(2)}`}
          </div>

          {bot.position === 'open' &&
            bot.unrealizedPnlPercent != null && (
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color:
                    (bot.unrealizedPnlPercent ?? 0) >= 0
                      ? 'var(--green)'
                      : 'var(--red)',
                }}
              >
                {(bot.unrealizedPnlPercent ?? 0) >= 0 ? '+' : ''}
                {(bot.unrealizedPnlPercent ?? 0).toFixed(2)}%
              </div>
            )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              fontFamily: 'var(--mono)',
              marginBottom: 2,
            }}
          >
            Win Rate
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: 'var(--text)',
            }}
          >
            {bot.winRate?.toFixed(1) ?? '0.0'}%
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              fontFamily: 'var(--mono)',
              marginBottom: 2,
            }}
          >
            Trades
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: 'var(--text)',
            }}
          >
            {bot.trades ?? 0}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Badge status={bot.status} />
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
          }}
        >
          {new Date(bot.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}