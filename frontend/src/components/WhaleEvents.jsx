import { useMarkets } from '../hooks/useMarkets.js';

export default function WhaleEvents() {
  const { whaleEvents, loading } = useMarkets();

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🐋</span>
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            Whale Events
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)',
            boxShadow: '0 0 6px var(--green)',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>LIVE</span>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
          // Loading whale events...
        </div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          {whaleEvents.map((e, i) => (
            <div key={e.id} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 0',
              borderBottom: i < whaleEvents.length - 1 ? '1px solid rgba(30,45,69,0.4)' : 'none',
            }}>
              {/* Icon */}
              <div style={{
                width: 32, height: 32,
                borderRadius: 6,
                background: 'var(--bg3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}>
                {e.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}>
                    {e.amount} {e.symbol}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--green)',
                    fontWeight: 600,
                  }}>
                    {e.amountUsd}
                  </span>
                </div>
                <div style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {e.from} → {e.to}
                </div>
              </div>

              {/* Right side */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{
                  fontSize: 10,
                  fontFamily: 'var(--mono)',
                  color: e.tagColor,
                  background: `${e.tagColor}18`,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: `1px solid ${e.tagColor}30`,
                }}>
                  {e.tag}
                </span>
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--text-dim)',
                }}>
                  {e.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}