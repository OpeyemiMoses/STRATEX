import { useState, useEffect } from 'react';
import { useMarkets } from '../hooks/useMarkets.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function QwenAnalysis() {
  const { memes, l1s, l2s, trending } = useMarkets();
  const [analysis, setAnalysis] = useState('');
  const [whaleAnalysis, setWhaleAnalysis] = useState('');
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [whaleLoading, setWhaleLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('market');
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (l1s.length > 0) {
      runMarketAnalysis();
      runWhaleAnalysis();
    }
  }, [l1s]);

  const runMarketAnalysis = async () => {
    setLoading(true);
    setStreaming(true);
    setAnalysis('');
    setSignals([]);

    try {
      const topCoins = [...l1s, ...l2s].slice(0, 8).map(c => ({
        name: c.name,
        symbol: c.symbol?.toUpperCase(),
        price: c.current_price,
        change24h: c.price_change_percentage_24h?.toFixed(2),
        change7d: c.price_change_percentage_7d_in_currency?.toFixed(2),
        marketCap: c.market_cap,
        volume: c.total_volume,
      }));

      const topMemes = memes.slice(0, 5).map(c => ({
        name: c.name,
        symbol: c.symbol?.toUpperCase(),
        price: c.current_price,
        change24h: c.price_change_percentage_24h?.toFixed(2),
      }));

      const res = await fetch(`${API}/api/strategy/market-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topCoins, topMemes, trending: trending.slice(0, 5) }),
      });

      const data = await res.json();
      setAnalysis(data.analysis || '');
      setSignals(data.signals || []);
    } catch (err) {
      console.error('Market analysis error:', err);
      setAnalysis('// Failed to fetch market analysis. Please try again.');
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const runWhaleAnalysis = async () => {
    setWhaleLoading(true);
    setWhaleAnalysis('');
    try {
      const res = await fetch(`${API}/api/strategy/whale-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setWhaleAnalysis(data.analysis || '');
    } catch (err) {
      setWhaleAnalysis('// Failed to fetch whale analysis.');
    } finally {
      setWhaleLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
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
          Qwen AI Analysis
          <div style={{ width: 200, height: 1, background: 'var(--border)' }} />
        </div>
        <button
          onClick={() => { runMarketAnalysis(); runWhaleAnalysis(); }}
          style={{
            background: 'transparent',
            color: 'var(--blue)',
            border: '1px solid var(--blue)',
            borderRadius: 6,
            padding: '7px 16px',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
          }}
        >
          ↻ Refresh Analysis
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { id: 'market', label: 'Market Analysis' },
          { id: 'whale', label: 'Whale Analysis' },
          { id: 'signals', label: 'Trade Signals' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: activeTab === t.id ? 'var(--blue)' : 'var(--text-dim)',
              borderBottom: activeTab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Market Analysis Tab */}
      {activeTab === 'market' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: '#060A10',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 20,
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: '#7DD3FC',
            lineHeight: 1.9,
            whiteSpace: 'pre-wrap',
            minHeight: 300,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--blue)' }}>▶</span> QWEN_AI · MARKET INTELLIGENCE
              {loading && <span style={{ color: 'var(--blue)', animation: 'pulse 1s infinite' }}>· analyzing...</span>}
            </div>
            {loading ? (
              <span style={{ color: 'var(--text-dim)' }}>// Fetching market data and running AI analysis...</span>
            ) : (
              analysis || '// Click Refresh Analysis to start.'
            )}
          </div>
        </div>
      )}

      {/* Whale Analysis Tab */}
      {activeTab === 'whale' && (
        <div style={{
          background: '#060A10',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: '#7DD3FC',
          lineHeight: 1.9,
          whiteSpace: 'pre-wrap',
          minHeight: 300,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--blue)' }}>▶</span> QWEN_AI · WHALE MARKET ANALYSIS
            {whaleLoading && <span style={{ color: 'var(--blue)' }}>· analyzing...</span>}
          </div>
          {whaleLoading ? (
            <span style={{ color: 'var(--text-dim)' }}>// Analyzing whale movements...</span>
          ) : (
            whaleAnalysis || '// Click Refresh Analysis to start.'
          )}
        </div>
      )}

      {/* Trade Signals Tab */}
      {activeTab === 'signals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>
              // Generating trade signals...
            </div>
          ) : signals.length === 0 ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>
              // No signals yet. Click Refresh Analysis.
            </div>
          ) : (
            signals.map((s, i) => (
              <div key={i} style={{
                background: 'var(--bg2)',
                border: `1px solid ${s.direction === 'LONG' ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
                borderRadius: 8,
                padding: 16,
                transition: 'box-shadow 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px var(--blue-glow)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {s.image && (
                      <img src={s.image} alt={s.symbol} style={{ width: 28, height: 28, borderRadius: '50%' }} onError={e => e.target.style.display = 'none'} />
                    )}
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{s.symbol}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>{s.name}</div>
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: s.direction === 'LONG' ? 'var(--green)' : 'var(--red)',
                    background: s.direction === 'LONG' ? 'rgba(0,214,143,0.1)' : 'rgba(255,77,106,0.1)',
                    border: `1px solid ${s.direction === 'LONG' ? 'rgba(0,214,143,0.3)' : 'rgba(255,77,106,0.3)'}`,
                    padding: '4px 12px',
                    borderRadius: 4,
                  }}>
                    {s.direction === 'LONG' ? '↑ LONG' : '↓ SHORT'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  {[
                    { l: 'Current Price', v: `$${s.currentPrice?.toLocaleString()}`, c: 'var(--text)' },
                    { l: 'Entry Zone', v: s.entry, c: 'var(--blue)' },
                    { l: 'Take Profit', v: s.takeProfit, c: 'var(--green)' },
                    { l: 'Stop Loss', v: s.stopLoss, c: 'var(--red)' },
                    { l: 'Confidence', v: s.confidence, c: 'var(--yellow)' },
                    { l: 'Timeframe', v: s.timeframe, c: 'var(--text-mid)' },
                  ].map(m => (
                    <div key={m.l} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.l}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>

                {s.reasoning && (
                  <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {s.reasoning}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}