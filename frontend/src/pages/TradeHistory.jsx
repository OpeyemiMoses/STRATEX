import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import AssetIcon from '../components/AssetIcon.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function TradeHistory() {
  const { address, isConnected } = useAccount();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  useEffect(() => {
    if (!isConnected) return;
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API}/api/bots/history/${address}`);
        const data = await res.json();
        setHistory(data);
      } catch (err) {
        console.error('Trade history fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, [address, isConnected]);

  const handleCopy = () => {
    const text = JSON.stringify(history, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEntry = (e, entry) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    setCopiedIndex(entry.index);
    setTimeout(() => setCopiedIndex(null), 2000);
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

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(30,45,69,0.5)',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: 'var(--text-mid)',
  };

  if (!isConnected) {
    return (
      <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
        // Connect your wallet to view trade history
      </div>
    );
  }

  return (
    <div style={{ padding: 20, paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{
          fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.1em', fontFamily: 'var(--mono)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          Trade History
          <div style={{ width: 200, height: 1, background: 'var(--border)' }} />
        </div>
        <button
          onClick={handleCopy}
          disabled={history.length === 0}
          style={{
            background: copied ? 'var(--green)' : 'var(--blue)',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 12, fontWeight: 500,
            cursor: history.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--sans)', opacity: history.length === 0 ? 0.5 : 1,
          }}
        >
          {copied ? '✓ Copied' : '📋 Copy All as JSON'}
        </button>
      </div>

      {loading ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>
          // Loading history...
        </div>
      ) : history.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📜</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-mid)' }}>
            // No archived trades yet. Closed bots will appear here.
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="history-desktop-table" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr>
                    {['#', 'Bot', 'Asset', 'Final P&L', 'Trades', 'Closed', 'Archived', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.index}>
                      <td style={tdStyle}>{h.index}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AssetIcon asset={h.asset} size={18} />
                          {h.botName}
                        </div>
                      </td>
                      <td style={tdStyle}>{h.asset}</td>
                      <td style={{ ...tdStyle, color: h.finalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {h.finalPnl >= 0 ? '+' : ''}${h.finalPnl?.toFixed(2) ?? '0.00'}
                      </td>
                      <td style={tdStyle}>{h.trades ?? 0}</td>
                      <td style={tdStyle}>{h.closedAt ? new Date(h.closedAt).toLocaleString() : '—'}</td>
                      <td style={tdStyle}>{new Date(h.archivedAt).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={e => handleCopyEntry(e, h)}
                          style={{
                            background: 'transparent',
                            color: copiedIndex === h.index ? 'var(--green)' : 'var(--blue)',
                            border: `1px solid ${copiedIndex === h.index ? 'var(--green)' : 'var(--blue)'}`,
                            borderRadius: 4,
                            padding: '3px 8px',
                            fontSize: 10,
                            cursor: 'pointer',
                            fontFamily: 'var(--mono)',
                            whiteSpace: 'nowrap',
                            transition: 'color 0.2s, border-color 0.2s',
                          }}
                        >
                          {copiedIndex === h.index ? '✓' : '📋'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="history-mobile-cards">
            {history.map(h => (
              <div key={h.index} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 14, marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AssetIcon asset={h.asset} size={20} />
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500 }}>#{h.index} · {h.botName}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>{h.asset}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
                  <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 9 }}>Final P&L</div>
                    <div style={{ color: h.finalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {h.finalPnl >= 0 ? '+' : ''}${h.finalPnl?.toFixed(2) ?? '0.00'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 9 }}>Trades</div>
                    <div style={{ color: 'var(--text-mid)' }}>{h.trades ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 9 }}>Closed</div>
                    <div style={{ color: 'var(--text-mid)' }}>{h.closedAt ? new Date(h.closedAt).toLocaleDateString() : '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 9 }}>Archived</div>
                    <div style={{ color: 'var(--text-mid)' }}>{new Date(h.archivedAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    onClick={e => handleCopyEntry(e, h)}
                    style={{
                      background: 'transparent',
                      color: copiedIndex === h.index ? 'var(--green)' : 'var(--blue)',
                      border: `1px solid ${copiedIndex === h.index ? 'var(--green)' : 'rgba(27,111,248,0.4)'}`,
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      transition: 'color 0.2s, border-color 0.2s',
                    }}
                  >
                    {copiedIndex === h.index ? '✓ Copied' : '📋 Copy Entry'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        .history-mobile-cards { display: none; }
        @media (max-width: 768px) {
          .history-desktop-table { display: none; }
          .history-mobile-cards { display: block; }
        }
      `}</style>
    </div>
  );
}