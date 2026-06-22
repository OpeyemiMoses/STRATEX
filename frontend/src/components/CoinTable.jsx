export default function CoinTable({ coins, title, icon }) {
  if (!coins?.length) return null;

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
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {title}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'Coin', 'Price', '24h %', '7d %', 'Market Cap', 'Volume 24h'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px',
                  textAlign: h === '#' ? 'center' : 'left',
                  color: 'var(--text-dim)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 500,
                  fontFamily: 'var(--mono)',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coins.map((coin, i) => {
              const change24h = coin.price_change_percentage_24h;
              const change7d = coin.price_change_percentage_7d_in_currency;
              return (
                <tr
                  key={coin.id}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,111,248,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                >
                  <td style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    textAlign: 'center',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                  }}>
                    {coin.market_cap_rank || i + 1}
                  </td>
                  <td style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={coin.image}
                        alt={coin.name}
                        style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }}
                        onError={e => e.target.style.display = 'none'}
                      />
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {coin.symbol?.toUpperCase()}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                          {coin.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--text)',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                    whiteSpace: 'nowrap',
                  }}>
                    ${coin.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </td>
                  <td style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: change24h >= 0 ? 'var(--green)' : 'var(--red)',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                    whiteSpace: 'nowrap',
                  }}>
                    {change24h >= 0 ? '+' : ''}{change24h?.toFixed(2)}%
                  </td>
                  <td style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: change7d >= 0 ? 'var(--green)' : 'var(--red)',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                    whiteSpace: 'nowrap',
                  }}>
                    {change7d !== undefined ? `${change7d >= 0 ? '+' : ''}${change7d?.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--text-mid)',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                    whiteSpace: 'nowrap',
                  }}>
                    ${coin.market_cap?.toLocaleString()}
                  </td>
                  <td style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--text-mid)',
                    borderBottom: '1px solid rgba(30,45,69,0.5)',
                    whiteSpace: 'nowrap',
                  }}>
                    ${coin.total_volume?.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}