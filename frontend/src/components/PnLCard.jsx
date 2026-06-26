import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import html2canvas from 'html2canvas';
import stratexWordmark from '../assets/stratex.png';
import stratexBotLogo from '../assets/stratex-logo.png';
import bitgetLogo from '../assets/bitget.png';
import longCandles from '../assets/long.png';
import shortCandles from '../assets/short.png';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 576;
const MODAL_CHROME_ALLOWANCE = 220;
const MIN_SCALE = 0.4;

export default function PnLCard({ bot, isClosed = false }) {
  const cardRef = useRef(null);
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [livePrice, setLivePrice] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  useLayoutEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const availableWidth = wrapperRef.current.offsetWidth;
      const availableHeight = window.innerHeight * 0.9 - MODAL_CHROME_ALLOWANCE;

      const widthScale = availableWidth / CANVAS_WIDTH;
      const heightScale = availableHeight / CANVAS_HEIGHT;

      setScale(Math.max(MIN_SCALE, Math.min(1, widthScale, heightScale)));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const fetchLivePrice = async () => {
    try {
      const res = await fetch(`${API}/api/signals/ticker/${bot.asset}`);
      const data = await res.json();
      const price = parseFloat(data.price);
      return price && !isNaN(price) ? price : null;
    } catch (err) {
      console.error('Failed to fetch live price for PnL card:', err.message);
      return null;
    }
  };

  useEffect(() => {
    if (isClosed) return; // closed trades use stored final values, no live fetch needed
    let cancelled = false;

    const refresh = async () => {
      const price = await fetchLivePrice();
      if (!cancelled) setLivePrice(price);
    };

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isClosed, bot.asset]);


  const computeLivePnl = (price) => {
    const entry = bot.filledEntry;
    if (!price || !entry) {
      return {
        pnl: bot.unrealizedPnl ?? 0,
        pnlPercent: bot.unrealizedPnlPercent ?? 0,
        currentPrice: price,
      };
    }
    const isShort = bot.side === 'short';
    const leverage = bot.leverage && bot.leverage > 1 ? bot.leverage : 1;
    const margin = bot.positionValueUSDT || 0;
    const exposure = margin * leverage;

    // Raw price move %
    const rawMovePercent = isShort
      ? ((entry - price) / entry) * 100
      : ((price - entry) / entry) * 100;

    const pnlPercent = rawMovePercent;

    // Dollar P&L against full exposure
    const pnl = exposure * (rawMovePercent / 100);

    return { pnl, pnlPercent, currentPrice: price };
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      if (!isClosed) {
        const price = await fetchLivePrice();
        setLivePrice(price);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
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
          {/* Faded watermark */}
          <img
            src={stratexBotLogo}
            alt=""
            style={{
              position: 'absolute', right: '-60px', top: '50%',
              transform: 'translateY(-50%)', width: '640px',
              opacity: 0.06, pointerEvents: 'none',
            }}
          />

          {/* Top row */}
          <div style={{
            position: 'absolute', top: '40px', left: '48px', right: '48px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <img src={stratexWordmark} alt="Stratex" style={{ height: '34px', objectFit: 'contain' }} />
            <span style={{ fontSize: '17px', color: '#8b949e', letterSpacing: '0.04em' }}>
              {isClosed ? 'CLOSED POSITION' : 'LIVE POSITION'}
            </span>
          </div>

          {/* Candle cluster */}
          <img
            src={isProfit ? longCandles : shortCandles}
            alt=""
            style={{
              position: 'absolute', right: '60px', top: '50%',
              transform: 'translateY(-50%)', width: '380px',
              objectFit: 'contain', zIndex: 1, pointerEvents: 'none',
            }}
          />

          {/* Main content */}
          <div style={{
            position: 'absolute', left: '48px', top: '140px',
            maxWidth: '560px', zIndex: 2,
          }}>
            {/* Asset . Side . Leverage */}
            <div style={{
              fontSize: '46px', fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'baseline', gap: '14px',
              marginBottom: '18px', lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              <span>{bot.asset}</span>
              <span style={{ color: '#6e7681', fontWeight: 400 }}>·</span>
              <span>{bot.side === 'short' ? 'SHORT' : 'LONG'}</span>
              {hasLeverage && (
                <span style={{ fontSize: '0.65em', color: '#cbd5e1' }}>{bot.leverage}X</span>
              )}
            </div>

            {/* Entry / current price */}
            <div style={{
              fontSize: '19px', color: '#8b949e', marginBottom: '28px',
              display: 'flex', gap: '24px', whiteSpace: 'nowrap',
            }}>
              <span>Entry: ${Number(bot.filledEntry ?? 0).toFixed(2)}</span>
              {!isClosed && displayPrice && (
                <span>Current: ${Number(displayPrice).toFixed(2)}</span>
              )}
            </div>

            {/* Big P&L number */}
            <div style={{
              fontSize: '76px', fontWeight: 800, color: pnlColor,
              lineHeight: 1, marginBottom: '10px', whiteSpace: 'nowrap',
            }}>
              {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
            </div>

            {/* Percentage -- raw price move, not leverage-amplified.
                Leverage is already shown via the badge next to LONG/SHORT above. */}
            <div style={{ fontSize: '30px', fontWeight: 700, color: pnlColor }}>
              {isProfit ? '+' : ''}{Number(pnlPercent).toFixed(3)}%
            </div>
          </div>

          {/* Bottom row */}
          <div style={{
            position: 'absolute', bottom: '40px', left: '48px', right: '48px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2,
          }}>
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
          marginTop: '12px', padding: '8px 16px',
          background: '#1B6FF8', color: '#fff',
          border: 'none', borderRadius: '6px',
          cursor: downloading ? 'wait' : 'pointer',
          fontFamily: 'JetBrains Mono, monospace', fontSize: '12px',
        }}
      >
        {downloading ? 'Generating...' : 'Download PnL Card'}
      </button>
      {error && <div style={{ color: '#E84D4D', fontSize: '11px', marginTop: '6px' }}>{error}</div>}
    </div>
  );
}