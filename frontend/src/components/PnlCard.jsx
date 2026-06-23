import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Shareable PnL card with PNG download.
 *
 * Works for both running bots (fetches a fresh live price on download click,
 * rather than relying on the 60s simulator cycle) and closed/archived trades
 * (uses the final stored P&L, no live fetch needed).
 *
 * @param {Object} bot - either a live bot object (status: 'active', position: 'open')
 *                        or an archived trade-history entry
 * @param {boolean} isClosed - true if this is a closed/archived trade
 */
export default function PnLCard({ bot, isClosed = false }) {
  const cardRef = useRef(null);
  const [livePrice, setLivePrice] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLivePrice = async () => {
    try {
      const res = await fetch(`${API}/api/signals/ticker?symbol=${bot.asset}`);
      const data = await res.json();
      return data.price ?? data.lastPr ?? null;
    } catch (err) {
      console.error('Failed to fetch live price for PnL card:', err.message);
      return null;
    }
  };

  const computeLivePnl = (price) => {
    const entry = bot.filledEntry;
    if (!price || !entry) return { pnl: bot.unrealizedPnl ?? 0, pnlPercent: bot.unrealizedPnlPercent ?? 0 };
    const isShort = bot.side === 'short';
    const pnlPercent = isShort ? ((entry - price) / entry) * 100 : ((price - entry) / entry) * 100;
    const pnl = (bot.positionValueUSDT || 0) * (pnlPercent / 100);
    return { pnl, pnlPercent };
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      if (!isClosed) {
        const price = await fetchLivePrice();
        setLivePrice(price);
        // wait one tick so the DOM re-renders with the fresh price before capture
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0D1117',
        scale: 2, // retina-quality export
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `stratex-${bot.asset}-${isClosed ? 'closed' : 'live'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('PnL card download failed:', err.message);
      setError('Could not generate card. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  const displayPrice = isClosed ? null : livePrice;
  const { pnl, pnlPercent } = isClosed
    ? { pnl: bot.finalPnl ?? bot.pnl, pnlPercent: bot.finalPnlPercent ?? bot.pnlPercent }
    : computeLivePnl(displayPrice);

  const isProfit = pnl >= 0;

  return (
    <div>
      {/* The actual card that gets captured */}
      <div
        ref={cardRef}
        style={{
          width: '360px',
          padding: '28px',
          background: 'linear-gradient(135deg, #0D1117 0%, #161b22 100%)',
          border: '1px solid #1B6FF8',
          borderRadius: '16px',
          fontFamily: 'JetBrains Mono, monospace',
          color: '#e6edf3',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1B6FF8' }}>STRATEX</span>
          <span style={{ fontSize: '10px', color: '#6e7681' }}>
            {isClosed ? 'CLOSED POSITION' : 'LIVE POSITION'}
          </span>
        </div>

        <div style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' }}>
          {bot.asset} · {bot.side === 'short' ? 'SHORT' : 'LONG'}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '20px' }}>
          Entry: ${Number(bot.filledEntry).toFixed(2)}
          {!isClosed && displayPrice && ` → Now: $${Number(displayPrice).toFixed(2)}`}
        </div>

        <div
          style={{
            fontSize: '36px',
            fontWeight: 'bold',
            color: isProfit ? '#3DD68C' : '#E84D4D',
            marginBottom: '4px',
          }}
        >
          {isProfit ? '+' : ''}${Number(pnl).toFixed(2)}
        </div>
        <div style={{ fontSize: '16px', color: isProfit ? '#3DD68C' : '#E84D4D', marginBottom: '20px' }}>
          {isProfit ? '+' : ''}{Number(pnlPercent).toFixed(2)}%
        </div>

        <div style={{ fontSize: '10px', color: '#6e7681', borderTop: '1px solid #1f2937', paddingTop: '12px' }}>
          {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {' · '}Paper trading — simulated P&L
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        style={{
          marginTop: '12px',
          padding: '8px 16px',
          background: '#1B6FF8',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: downloading ? 'wait' : 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '12px',
        }}
      >
        {downloading ? 'Generating...' : 'Download PnL Card'}
      </button>
      {error && <div style={{ color: '#E84D4D', fontSize: '11px', marginTop: '6px' }}>{error}</div>}
    </div>
  );
}