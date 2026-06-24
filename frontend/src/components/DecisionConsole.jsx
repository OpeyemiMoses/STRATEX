import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const POLL_INTERVAL_MS = 5000;

const TABS = [
  { key: 'all', label: 'All', types: null },
  { key: 'risk_assessment', label: 'Risk', types: ['risk_assessment'] },
  { key: 'sl_tp_adjustment', label: 'Adjustments', types: ['sl_tp_adjustment'] },
  { key: 'audit_flag', label: 'Audits', types: ['audit_flag'] },
];

const SEVERITY_COLOR = {
  info: '#1B6FF8',
  warning: '#E8A33D',
  critical: '#E84D4D',
};

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function DecisionConsole() {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [entries, setEntries] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastSeenTimestampRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Hide on landing page or when not connected -- computed here, but NOT
  // used to bail out early. The actual "don't render anything" decision
  // happens at the very end, after every hook below has already run. Every
  // hook must execute on every render, in the same order, no matter what --
  // an early `return null` placed before a hook call is what caused
  // "Rendered more hooks than during the previous render": on a landing-page
  // render this component would stop before ever reaching the two
  // useEffect calls further down, so React saw a different hook count than
  // on a render where isConnected was true.
  const isLanding = location.pathname === '/';
  const shouldRender = !isLanding && isConnected;

  const fetchEntries = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const tab = TABS.find(t => t.key === activeTab);
      const typeParam = tab?.types ? `&type=${tab.types[0]}` : '';
      const res = await fetch(`${API}/api/decisions/recent?limit=100&wallet=${address}${typeParam}`);
      const data = await res.json();
      setEntries(data);

      if (!isOpen && data.length > 0) {
        const newest = data[0].timestamp;
        if (lastSeenTimestampRef.current && newest > lastSeenTimestampRef.current) {
          const newCount = data.filter(e => e.timestamp > lastSeenTimestampRef.current).length;
          setUnseenCount(prev => prev + newCount);
        } else if (!lastSeenTimestampRef.current) {
          lastSeenTimestampRef.current = newest;
        }
      }
    } catch (err) {
      console.error('Failed to fetch decision log:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Polling effect -- now guarded INSIDE the effect body instead of skipping
  // the hook call itself. The hook always runs; it just may choose to do
  // nothing when shouldRender is false.
  useEffect(() => {
    if (!shouldRender) return;
    fetchEntries();
    const interval = setInterval(fetchEntries, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeTab, address, shouldRender]);

  // Close on outside click -- same pattern, guard inside the effect body.
  useEffect(() => {
    if (!shouldRender || !isOpen) return;
    const handleOutsideClick = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [shouldRender, isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setUnseenCount(0);
    if (entries.length > 0) lastSeenTimestampRef.current = entries[0].timestamp;
  };

  const handleClear = async () => {
    try {
      await fetch(`${API}/api/decisions/clear?wallet=${address}`, { method: 'DELETE' });
      setEntries([]);
      setUnseenCount(0);
      lastSeenTimestampRef.current = null;
    } catch (err) {
      console.error('Failed to clear decision log:', err.message);
    }
  };

  // The ONLY place we bail out of rendering JSX -- placed after every hook
  // above has already run unconditionally, so the hook count is identical
  // on every render regardless of route or connection state.
  if (!shouldRender) return null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        ref={buttonRef}
        onClick={() => (isOpen ? setIsOpen(false) : handleOpen())}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: '#1B6FF8',
          border: 'none',
          color: '#fff',
          fontSize: '20px',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="decision-console-toggle"
        aria-label="Toggle decision console"
      >
        {isOpen ? '✕' : '⚡'}
        {!isOpen && unseenCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: '#E84D4D', color: '#fff', borderRadius: '999px',
            fontSize: '11px', fontFamily: 'JetBrains Mono, monospace',
            minWidth: '18px', height: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {unseenCount > 99 ? '99+' : unseenCount}
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="decision-console-panel"
          style={{
            position: 'fixed',
            bottom: '88px',
            right: '24px',
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            height: '480px',
            maxHeight: 'calc(100vh - 160px)',
            background: '#0D1117',
            border: '1px solid #1B6FF8',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderBottom: '1px solid #1f2937', flexShrink: 0,
          }}>
            <span style={{ fontSize: '11px', color: '#8b949e' }}>
              Decision Console
            </span>
            <button
              onClick={handleClear}
              style={{
                background: 'transparent', border: '1px solid #1f2937',
                borderRadius: 4, color: '#8b949e', fontSize: '10px',
                padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Clear
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: '10px 6px',
                  background: activeTab === tab.key ? '#1B6FF8' : 'transparent',
                  color: activeTab === tab.key ? '#fff' : '#8b949e',
                  border: 'none', fontSize: '11px', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Entry list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading && entries.length === 0 && (
              <div style={{ color: '#8b949e', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                Loading...
              </div>
            )}
            {!loading && entries.length === 0 && (
              <div style={{ color: '#8b949e', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                No activity yet.
              </div>
            )}
            {entries.map(entry => (
              <div
                key={entry.id}
                style={{
                  padding: '8px 10px', marginBottom: '6px',
                  background: '#161b22', borderRadius: '6px',
                  borderLeft: `3px solid ${SEVERITY_COLOR[entry.severity] || '#1B6FF8'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#1B6FF8', textTransform: 'uppercase' }}>
                    {entry.type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: '10px', color: '#8b949e' }}>{timeAgo(entry.timestamp)}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#e6edf3', lineHeight: '1.4' }}>{entry.reasoning}</div>
                {entry.botId && (
                  <div style={{ fontSize: '10px', color: '#6e7681', marginTop: '4px' }}>
                    bot: {entry.botId}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .decision-console-toggle {
            bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 12px) !important;
          }
          .decision-console-panel {
            bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 76px) !important;
            height: 360px !important;
          }
        }
      `}</style>
    </>
  );
}