import { useState } from 'react';
import { useMarkets } from '../hooks/useMarkets.js';

export default function TrendingCoins() {
  const { trending, loading } = useMarkets();

  if (loading) return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', padding: '20px 0' }}>
      // Fetching trending coins...
    </div>
  );

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
        gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>🔥</span>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Top Searches
        </span>
      </div>

      <div style={{
        display: 'flex',
        gap: 0,
        overflowX: 'auto',
        padding: '12px 16px',
        scrollbarWidth: 'none',
      }}>
        {trending.map((coin, i) => (
          <div
            key={coin.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              marginRight: 8,
              flexShrink: 0,
              background: 'var(--bg3)',
              cursor: 'pointer',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--blue)';
              e.currentTarget.style.boxShadow = '0 0 12px var(--blue-glow)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text-dim)',
              minWidth: 14,
            }}>
              {i + 1}
            </span>
            <img
              src={coin.thumb}
              alt={coin.name}
              style={{ width: 20, height: 20, borderRadius: '50%' }}
              onError={e => e.target.style.display = 'none'}
            />
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                {coin.symbol}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                {coin.name}
              </div>
            </div>
            {coin.data?.price_change_percentage_24h?.usd !== undefined && (
              <span style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: coin.data.price_change_percentage_24h.usd >= 0 ? 'var(--green)' : 'var(--red)',
                marginLeft: 4,
              }}>
                {coin.data.price_change_percentage_24h.usd >= 0 ? '+' : ''}
                {coin.data.price_change_percentage_24h.usd?.toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}