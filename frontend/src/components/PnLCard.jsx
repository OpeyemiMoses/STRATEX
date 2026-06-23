import { useRef, useState, useLayoutEffect } from 'react';
import html2canvas from 'html2canvas';
import stratexWordmark from '../assets/stratex.png';
import stratexBotLogo from '../assets/stratex-logo.png';
import bitgetLogo from '../assets/bitget.png';
import longCandles from '../assets/long.png';
import shortCandles from '../assets/short.png';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Fixed internal canvas size — matches the 16:9 reference design exactly.
// Every absolutely-positioned element below is laid out against THESE
// dimensions, never against whatever width a parent container (e.g. the
// Modal) happens to hand us. The outer wrapper scales this canvas down to
// fit available space using a CSS transform, so the layout itself can never
// be squashed, overlapped, or have its aspect ratio fought by a flexbox
// parent — which is what caused the broken render in testing.
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 576;

/**
 * Shareable PnL card with PNG download — visually matches the approved
 * reference design exactly: full-bleed dark card, faded bot-logo watermark,
 * Stratex wordmark top-left, "LIVE POSITION" label top-right, real candle
 * cluster image colored by profit/loss, bot logo + timestamp + Bitget logo
 * along the bottom.
 *
 * Works for both running bots (fetches a fresh live price on download click,
 * rather than relying on the simulator's polling cycle) and closed/archived
 * trades (uses the final stored P&L, no live fetch needed).
 *
 * @param {Object} bot - either a live bot object (status: 'active', position: 'open')
 *                        or an archived trade-history entry
 * @param {boolean} isClosed - true if this is a closed/archived trade
 */
export default function PnLCard({ bot, isClosed = false }) {
  const cardRef = useRef(null); // the fixed-size inner canvas — this is what html2canvas captures
  const wrapperRef = useRef(null); // the responsive outer container we measure to compute scale
  const [scale, setScale] = useState(1);
  const [livePrice, setLivePrice] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  // Measure the available width and scale the fixed canvas down to fit,
  // preserving exact proportions. Re-measures on resize so it works inside
  // a modal at any viewport size.
  useLayoutEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const availableWidth = wrapperRef.current.offsetWidth;
      setScale(Math.min(1, availableWidth / CANVAS_WIDTH));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

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
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Capture the fixed-size canvas directly — NOT through the scaled
      // wrapper — so the downloaded PNG is always full resolution
      // (1024x576 * scale factor below) regardless of how small it's
      // currently being displayed on screen.
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0B1018',
        scale: 2,
        useCORS: true,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
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
  const pnlColor = isProfit ? '#3DD68C' : '#E84D4D';
  const hasLeverage = bot.leverage && bot.leverage > 1;

  return (
    <div>
      {/* Outer responsive wrapper — its height is set to the SCALED height of
          the fixed canvas, so it never collapses or fights for space inside
          a flex/modal parent. The fixed canvas inside is scaled via
          transform, not resized, so internal layout never breaks. */}
      <div
        ref={wrapperRef}
        style={{
          width: '100%',
          height: `${CANVAS_HEIGHT * scale}px`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          ref={cardRef}
          style={{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
            overflow: 'hidden',
            background: '#0B1018',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#fff',
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          {/* Large faded bot-logo watermark, right-of-center */}
          <img
            src={stratexBotLogo}
            alt=""
            style={{
              position: 'absolute',
              right: '-60px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '640px',
              opacity: 0.06,
              pointerEvents: 'none',
            }}
          />

          {/* Top row: wordmark + LIVE/CLOSED label */}
          <div
            style={{
              position: 'absolute',
              top: '40px',
              left: '48px',
              right: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <img src={stratexWordmark} alt="Stratex" style={{ height: '34px', objectFit: 'contain' }} />
            <span style={{ fontSize: '17px', color: '#8b949e', letterSpacing: '0.04em' }}>
              {isClosed ? 'CLOSED POSITION' : 'LIVE POSITION'}
            </span>
          </div>

          {/* Candle cluster image — long.png (green, ascending) for profit,
              short.png (red, descending) for loss. Sits to the right,
              vertically centered, never overlapping the text block since
              the text block has a fixed maxWidth well clear of this. */}
          <img
            src={isProfit ? longCandles : shortCandles}
            alt=""
            style={{
              position: 'absolute',
              right: '60px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '380px',
              objectFit: 'contain',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />

          {/* Main content block, left side — fixed maxWidth keeps it clear
              of the candle image on the right at this canvas size. */}
          <div
            style={{
              position: 'absolute',
              left: '48px',
              top: '140px',
              maxWidth: '560px',
              zIndex: 2,
            }}
          >
            {/* Asset · Side · Leverage */}
            <div
              style={{
                fontSize: '46px',
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
                alignItems: 'baseline',
                gap: '14px',
                marginBottom: '18px',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <span>{bot.asset}</span>
              <span style={{ color: '#6e7681', fontWeight: 400 }}>·</span>
              <span>{bot.side === 'short' ? 'SHORT' : 'LONG'}</span>
              {hasLeverage && <span style={{ fontSize: '0.65em', color: '#cbd5e1' }}>{bot.leverage}X</span>}
            </div>

            {/* Entry / current price */}
            <div
              style={{
                fontSize: '19px',
                color: '#8b949e',
                marginBottom: '28px',
                display: 'flex',
                gap: '24px',
                whiteSpace: 'nowrap',
              }}
            >
              <span>Entry: ${Number(bot.filledEntry).toFixed(2)}</span>
              {!isClosed && displayPrice && <span>Current Price: ${Number(displayPrice).toFixed(2)}</span>}
            </div>

            {/* Big P&L number */}
            <div
              style={{
                fontSize: '76px',
                fontWeight: 800,
                color: pnlColor,
                lineHeight: 1,
                marginBottom: '10px',
                whiteSpace: 'nowrap',
              }}
            >
              {isProfit ? '+' : ''}${Math.abs(pnl).toFixed(2)}
            </div>

            {/* Percentage */}
            <div style={{ fontSize: '30px', fontWeight: 700, color: pnlColor }}>
              {isProfit ? '+' : ''}{Number(pnlPercent).toFixed(3)}%
            </div>
          </div>

          {/* Bottom row: bot logo + timestamp + Bitget logo */}
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              left: '48px',
              right: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img src={stratexBotLogo} alt="" style={{ height: '50px', objectFit: 'contain' }} />
              <span style={{ fontSize: '16px', color: '#8b949e', whiteSpace: 'nowrap' }}>
                {new Date().toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })} · Paper Trading - Simulated
              </span>
            </div>
            <img src={bitgetLogo} alt="Bitget" style={{ height: '26px', objectFit: 'contain' }} />
          </div>
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