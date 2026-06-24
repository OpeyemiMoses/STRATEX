import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import AssetIcon from '../components/AssetIcon.jsx';
import PnLCard from '../components/PnLCard.jsx';
import Modal from '../components/Modal.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function TradeHistory() {
  const { address, isConnected } = useAccount();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const [auditingId, setAuditingId] = useState(null);
  const [auditResults, setAuditResults] = useState({});
  const [auditModalEntry, setAuditModalEntry] = useState(null);
  const [pnlModalEntry, setPnlModalEntry] = useState(null);

  const severityColor = {
    info: 'var(--blue)',
    warning: '#F59E0B',
    critical: 'var(--red)',
  };

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
    navigator.clipboard.writeText(JSON.stringify(history, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEntry = (e, entry) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    setCopiedIndex(entry.index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleAuditEntry = async (e, entry) => {
    e.stopPropagation();
    setAuditModalEntry(entry);
    if (auditResults[entry.botId]) return;
    setAuditingId(entry.botId);
    try {
      const res = await fetch(`${API}/api/bots/${entry.botId}/audit`, { method: 'POST' });
      if (!res.ok) throw new Error('Audit failed');
      const data = await res.json();
      setAuditResults(prev => ({ ...prev, [entry.botId]: data }));
    } catch (err) {
      setAuditResults(prev => ({ ...prev, [entry.botId]: { error: 'Audit failed. Please try again.' } }));
    } finally {
      setAuditingId(null);
    }
  };

  const handleOpenPnlCard = (e, entry) => {
    e.stopPropagation();
    setPnlModalEntry(entry);
  };

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)',
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
    borderBottom: '1px solid var(--border)', fontWeight: 500,
    fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '10px 12px', borderBottom: '1px solid rgba(30,45,69,0.5)',
    fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)',
  };

  const renderAuditModalContent = () => {
    if (!auditModalEntry) return null;
    const isLoading = auditingId === auditModalEntry.botId;
    const result = auditResults[auditModalEntry.botId];

    if (isLoading) return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>
        // Reviewing this bot's history...
      </div>
    );
    if (!result) return null;
    if (result.error) return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>{result.error}</div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {result.overallAssessment && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 6 }}>
            {result.overallAssessment}
          </div>
        )}
        {result.flags?.length === 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)' }}>✓ No issues found</div>
        )}
        {result.flags?.map((flag, i) => (
          <div key={i} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 6, borderLeft: `3px solid ${severityColor[flag.severity] || 'var(--blue)'}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{flag.issue}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{flag.reasoning}</div>
          </div>
        ))}
      </div>
    );
  };

  // Direction badge component
  const DirectionBadge = ({ side }) => {
    const isLong = side !== 'short';
    return (
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
        color: isLong ? 'var(--green)' : 'var(--red)',
        background: isLong ? 'rgba(0,214,143,0.1)' : 'rgba(255,77,106,0.1)',
        border: `1px solid ${isLong ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
        padding: '1px 5px', borderRadius: 3, marginLeft: 6,
      }}>
        {isLong ? '▲ LONG' : '▼ SHORT'}
      </span>
    );
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
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 12 }}>
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
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>
                    {['#', 'Bot', 'Asset', 'Type', 'Final P&L', 'Trades', 'Closed', 'Archived', ''].map(h => (
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
                      {/* Trade type — LONG / SHORT + leverage if used */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                            color: h.side !== 'short' ? 'var(--green)' : 'var(--red)',
                            background: h.side !== 'short' ? 'rgba(0,214,143,0.1)' : 'rgba(255,77,106,0.1)',
                            border: `1px solid ${h.side !== 'short' ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
                            padding: '2px 6px', borderRadius: 3,
                          }}>
                            {h.side !== 'short' ? '▲ LONG' : '▼ SHORT'}
                          </span>
                          {h.leverage && h.leverage > 1 && (
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                              color: '#F59E0B', background: 'rgba(245,158,11,0.1)',
                              border: '1px solid rgba(245,158,11,0.3)',
                              padding: '2px 6px', borderRadius: 3,
                            }}>
                              {h.leverage}x
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: h.finalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {h.finalPnl >= 0 ? '+' : ''}${h.finalPnl?.toFixed(2) ?? '0.00'}
                      </td>
                      <td style={tdStyle}>{h.trades ?? 0}</td>
                      <td style={tdStyle}>{h.closedAt ? new Date(h.closedAt).toLocaleString() : '—'}</td>
                      <td style={tdStyle}>{new Date(h.archivedAt).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={e => handleCopyEntry(e, h)} style={{ background: 'transparent', color: copiedIndex === h.index ? 'var(--green)' : 'var(--blue)', border: `1px solid ${copiedIndex === h.index ? 'var(--green)' : 'var(--blue)'}`, borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', transition: 'color 0.2s, border-color 0.2s' }}>
                            {copiedIndex === h.index ? '✓' : '📋'}
                          </button>
                          <button onClick={e => handleAuditEntry(e, h)} style={{ background: 'transparent', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                            🔍
                          </button>
                          <button onClick={e => handleOpenPnlCard(e, h)} style={{ background: 'transparent', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                            💾
                          </button>
                        </div>
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
              <div key={h.index} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AssetIcon asset={h.asset} size={20} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      #{h.index} · {h.botName}
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                        color: h.side !== 'short' ? 'var(--green)' : 'var(--red)',
                        background: h.side !== 'short' ? 'rgba(0,214,143,0.1)' : 'rgba(255,77,106,0.1)',
                        border: `1px solid ${h.side !== 'short' ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
                        padding: '1px 5px', borderRadius: 3,
                      }}>
                        {h.side !== 'short' ? '▲ LONG' : '▼ SHORT'}
                      </span>
                      {h.leverage && h.leverage > 1 && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', borderRadius: 3 }}>
                          {h.leverage}x
                        </span>
                      )}
                    </div>
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                  <button onClick={e => handleCopyEntry(e, h)} style={{ background: 'transparent', color: copiedIndex === h.index ? 'var(--green)' : 'var(--blue)', border: `1px solid ${copiedIndex === h.index ? 'var(--green)' : 'rgba(27,111,248,0.4)'}`, borderRadius: 4, padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', transition: 'color 0.2s, border-color 0.2s' }}>
                    {copiedIndex === h.index ? '✓ Copied' : '📋 Copy'}
                  </button>
                  <button onClick={e => handleAuditEntry(e, h)} style={{ background: 'transparent', color: 'var(--blue)', border: '1px solid rgba(27,111,248,0.4)', borderRadius: 4, padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)' }}>
                    🔍 Audit
                  </button>
                  <button onClick={e => handleOpenPnlCard(e, h)} style={{ background: 'transparent', color: 'var(--blue)', border: '1px solid rgba(27,111,248,0.4)', borderRadius: 4, padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)' }}>
                    💾 Card
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Audit modal */}
      <Modal
        isOpen={!!auditModalEntry}
        onClose={() => setAuditModalEntry(null)}
        title={auditModalEntry ? `AI Audit · ${auditModalEntry.botName}` : 'AI Audit'}
      >
        {renderAuditModalContent()}
      </Modal>

      {/* PnL card modal — now passes leverage and side correctly */}
      <Modal
        isOpen={!!pnlModalEntry}
        onClose={() => setPnlModalEntry(null)}
        title="Shareable PnL Card"
      >
        {pnlModalEntry && (
          <PnLCard
            bot={{
              asset: pnlModalEntry.asset,
              side: pnlModalEntry.side,
              filledEntry: pnlModalEntry.filledEntry,
              positionValueUSDT: pnlModalEntry.positionValueUSDT,
              leverage: pnlModalEntry.leverage ?? 1,
              finalPnl: pnlModalEntry.finalPnl,
              finalPnlPercent: pnlModalEntry.finalPnlPercent,
            }}
            isClosed={true}
          />
        )}
      </Modal>

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