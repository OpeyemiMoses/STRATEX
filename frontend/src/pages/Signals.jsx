import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Signals() {
  const [fearGreed, setFearGreed] = useState({ value: 72, label: 'Greed' });
  const [liveFeed, setLiveFeed] = useState([]);
  const [technicals, setTechnicals] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState('BTCUSDT');
  const [loading, setLoading] = useState(true);
  const [tradeSignals, setTradeSignals] = useState([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalsError, setSignalsError] = useState('');
  const [signalsScannedAt, setSignalsScannedAt] = useState(null);
  const [whaleCount, setWhaleCount] = useState(null);

  useEffect(() => {
    fetchAll();
    fetchTradeSignals();
    const interval = setInterval(() => {
      fetchAll();
      fetchTradeSignals();
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedAsset]);

  const fetchAll = async () => {
    try {
      const [fgRes, feedRes, techRes] = await Promise.all([
        fetch(`${API}/api/signals/fear-greed`),
        fetch(`${API}/api/signals/live-feed`),
        fetch(`${API}/api/signals/technicals/${selectedAsset}`),
      ]);
      const [fg, feed, tech] = await Promise.all([
        fgRes.json(), feedRes.json(), techRes.json(),
      ]);
      setFearGreed(fg);
      setLiveFeed(Array.isArray(feed) ? feed : []);
      setTechnicals(tech);

      const whaleEntries = Array.isArray(feed) ? feed.filter(f => f.src === 'On-chain') : [];
      setWhaleCount(whaleEntries.length);

      // Fetch ticker through our backend (avoids CORS)
      try {
        const tickerRes = await fetch(`${API}/api/signals/ticker/${selectedAsset}`);
        const tickerData = await tickerRes.json();
        if (!tickerData.error) {
          setTicker({
            symbol: selectedAsset,
            price: parseFloat(tickerData.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            change24h: parseFloat(tickerData.change24h) * 100,
            high24h: parseFloat(tickerData.high24h),
            low24h: parseFloat(tickerData.low24h),
            volume24h: parseFloat(tickerData.volume24h),
          });
        }
      } catch (e) {
        console.error('Ticker error:', e);
      }
    } catch (err) {
      console.error('Signals fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTradeSignals = async () => {
    setSignalsLoading(true);
    setSignalsError('');
    try {
      const res = await fetch(`${API}/api/signals/trade-signals`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to fetch trade signals');
      const data = await res.json();
      setTradeSignals(Array.isArray(data.signals) ? data.signals : []);
      setSignalsScannedAt(data.scannedAt || null);
    } catch (err) {
      console.error('Trade signals error:', err);
      setSignalsError('Failed to load trade signals.');
    } finally {
      setSignalsLoading(false);
    }
  };

  const getFGColor = (value) => {
    if (value >= 75) return '#00D68F';
    if (value >= 55) return '#7DD3FC';
    if (value >= 45) return '#F5A623';
    if (value >= 25) return '#FF8C42';
    return '#FF4D6A';
  };

  const fgColor = getFGColor(fearGreed.value);

  const SIGNALS = [
    {
      name: 'Sentiment',
      desc: 'Fear & Greed Index',
      value: fearGreed.label,
      valueColor: fgColor,
      icon: '😰',
      bg: 'rgba(0,214,143,0.1)',
    },
    {
      name: 'Technical Indicators',
      desc: 'RSI, MACD, EMA, BB',
      value: technicals?.signal || '—',
      valueColor: technicals?.signal === 'Bullish' ? '#00D68F' : '#FF4D6A',
      icon: '📊',
      bg: 'rgba(27,111,248,0.1)',
    },
    {
      name: 'News Briefing',
      desc: 'Latest crypto news',
      value: '3 New',
      valueColor: '#F5A623',
      icon: '📰',
      bg: 'rgba(245,166,35,0.1)',
    },
    {
      name: 'On-chain Data',
      desc: 'Whale flows, metrics',
      value: whaleCount === null ? '—' : whaleCount > 0 ? `${whaleCount} Whale${whaleCount !== 1 ? 's' : ''}` : 'Quiet',
      valueColor: whaleCount > 0 ? '#F5A623' : '#94A3B8',
      icon: '🔗',
      bg: 'rgba(100,116,139,0.1)',
    },
    {
      name: 'Macro Signals',
      desc: 'CPI, Fed rates, DXY',
      value: 'Neutral',
      valueColor: '#94A3B8',
      icon: '🌐',
      bg: 'rgba(100,116,139,0.1)',
    },
  ];

  const sideColor = (side) => side === 'short' ? 'var(--red)' : 'var(--green)';
  const confColor = (c) => c >= 70 ? 'var(--green)' : c >= 40 ? '#F59E0B' : 'var(--red)';

  return (
    <div style={{ padding: 20, paddingBottom: 80 }}>
      <div className="signals-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 12 }}>
          Market Intelligence
          <div className="signals-header-line" style={{ width: 200, height: 1, background: 'var(--border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>Asset:</span>
          <select
            value={selectedAsset}
            onChange={e => setSelectedAsset(e.target.value)}
            style={{
              background: '#060A10',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: '#7DD3FC',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
            }}
          >
            {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)',
            boxShadow: '0 0 6px var(--green)',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>LIVE</span>
        </div>
      </div>

      {/* Ticker Bar */}
      {ticker && (
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 16,
        }}>
          {[
            { l: 'Price', v: `$${ticker.price}` },
            { l: '24h Change', v: `${ticker.change24h >= 0 ? '+' : ''}${ticker.change24h?.toFixed(2)}%`, c: ticker.change24h >= 0 ? 'var(--green)' : 'var(--red)' },
            { l: '24h High', v: `$${parseFloat(ticker.high24h).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { l: '24h Low', v: `$${parseFloat(ticker.low24h).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { l: 'Volume', v: `$${parseFloat(ticker.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
          ].map(m => (
            <div key={m.l}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.l}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: m.c || 'var(--text)' }}>{m.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* NEW — Trade Signals: real, structured opportunities scanned across
          the watchlist, each with direction, entry, TP, SL, leverage,
          confidence, and reasoning grounded in real Bitget data. */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Trade Signals · Watchlist Scan
          </div>
          {signalsScannedAt && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              Scanned {new Date(signalsScannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {signalsLoading ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0' }}>
              // Scanning watchlist for opportunities...
            </div>
          ) : signalsError ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>{signalsError}</div>
          ) : tradeSignals.length === 0 ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0' }}>
              // No clear opportunities right now — markets are choppy or conditions are unfavorable across the watchlist.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {tradeSignals.map((sig, i) => (
                <div key={i} style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {sig.symbol}
                      </span>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: sideColor(sig.side),
                        background: sig.side === 'short' ? 'rgba(255,77,106,0.1)' : 'rgba(0,214,143,0.1)',
                        border: `1px solid ${sig.side === 'short' ? 'rgba(255,77,106,0.3)' : 'rgba(0,214,143,0.3)'}`,
                        padding: '2px 7px', borderRadius: 4,
                      }}>
                        {sig.side === 'short' ? '▼ Short' : '▲ Long'}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: confColor(sig.confidence) }}>
                      {sig.confidence}% conf
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                    {[
                      { l: 'Entry', v: `$${sig.entryPrice}` },
                      { l: 'Take Profit', v: `$${sig.takeProfitPrice}`, c: 'var(--green)' },
                      { l: 'Stop Loss', v: `$${sig.stopLossPrice}`, c: 'var(--red)' },
                    ].map(f => (
                      <div key={f.l}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{f.l}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: f.c || 'var(--text)' }}>{f.v}</div>
                      </div>
                    ))}
                  </div>

                  {sig.leverage > 1 && (
                    <div style={{
                      display: 'inline-block', marginBottom: 10,
                      fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                      color: '#F59E0B', background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      padding: '2px 7px', borderRadius: 4,
                    }}>
                      Suggested: {sig.leverage}x leverage
                    </div>
                  )}

                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                    {sig.reasoning}
                  </div>
                  {sig.regime && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                      Regime: {sig.regime}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Left - Live Feed + Technicals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Live Feed */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Live Feed
              </div>
            </div>
            <div style={{ padding: '0 16px' }}>
              {liveFeed.length === 0 ? (
                <div style={{ padding: '20px 0', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                  // Loading feed...
                </div>
              ) : liveFeed.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 0',
                  borderBottom: i < liveFeed.length - 1 ? '1px solid rgba(30,45,69,0.4)' : 'none',
                }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', minWidth: 50, marginTop: 2 }}>
                    {f.time}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{f.src}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{f.text}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontFamily: 'var(--mono)',
                    color: f.tagColor,
                    background: `${f.tagColor}18`,
                    padding: '2px 8px', borderRadius: 4, flexShrink: 0,
                    border: `1px solid ${f.tagColor}30`,
                  }}>
                    {f.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Technical Indicators */}
          {technicals && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                Technical Indicators
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                {[
                  { l: 'RSI (14)', v: technicals.rsi, c: parseFloat(technicals.rsi) < 30 ? 'var(--green)' : parseFloat(technicals.rsi) > 70 ? 'var(--red)' : 'var(--text)' },
                  { l: 'MACD', v: technicals.macd, c: technicals.macd === 'bullish' || technicals.macd === 'Bullish' ? 'var(--green)' : 'var(--red)' },
                  { l: 'Trend', v: technicals.trend, c: technicals.trend === 'bullish' || technicals.trend === 'Bullish' ? 'var(--green)' : 'var(--red)' },
                ].map(m => (
                  <div key={m.l} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{m.l}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: m.c, textTransform: 'capitalize' }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right - Signals + Fear & Greed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Agent Hub Skills */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
              Agent Hub Skills
            </div>
            {SIGNALS.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0',
                borderBottom: i < SIGNALS.length - 1 ? '1px solid rgba(30,45,69,0.4)' : 'none',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: s.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 1 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.desc}</div>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: s.valueColor }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Fear & Greed */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
              Fear & Greed Index
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 56, fontFamily: 'var(--mono)', fontWeight: 700, color: fgColor, lineHeight: 1 }}>
                {fearGreed.value}
              </div>
              <div style={{ fontSize: 13, color: fgColor, fontFamily: 'var(--mono)', marginTop: 6, marginBottom: 16 }}>
                {fearGreed.label?.toUpperCase()}
              </div>
              {/* Gauge bar */}
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  width: `${fearGreed.value}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, #FF4D6A, #F5A623, #00D68F)`,
                  borderRadius: 3,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                <span>Extreme Fear</span>
                <span>Neutral</span>
                <span>Extreme Greed</span>
              </div>
            </div>
          </div>

          {/* Macro Signals */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
              Macro Signals
            </div>
            {[
              { l: 'Fed Rate', v: '5.25%', c: 'var(--text-mid)' },
              { l: 'DXY', v: '104.2', c: 'var(--red)' },
              { l: 'BTC Dominance', v: '54.3%', c: 'var(--green)' },
              { l: 'Total Crypto MCap', v: '$2.4T', c: 'var(--text)' },
            ].map((m, i, arr) => (
              <div key={m.l} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(30,45,69,0.4)' : 'none',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{m.l}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: m.c }}>{m.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 320px"] {
            grid-template-columns: 1fr !important;
          }
          .signals-header-line {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}