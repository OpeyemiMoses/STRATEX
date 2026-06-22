import { useEffect, useRef, useState } from 'react';

export default function CandlestickChart({ symbol = 'BTCUSDT', interval = '1H', height = 300 }) {
  const canvasRef = useRef(null);
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);

  const GRANULARITY_MAP = {
    '1m': '1min', '5m': '5min', '15m': '15min',
    '30m': '30min', '1H': '1H', '4H': '4H', '1D': '1Dutc',
  };

  const fetchCandles = async () => {
    try {
      const granularity = GRANULARITY_MAP[interval] || '1H';
      const res = await fetch(
        `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=100`
      );
      const data = await res.json();
      if (data.data && Array.isArray(data.data)) {
        const formatted = data.data.map(c => ({
          time: parseInt(c[0]),
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
        })).reverse();
        setCandles(formatted);
      }
    } catch (err) {
      console.error('Candle fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectWS = () => {
    try {
      if (wsRef.current) wsRef.current.close();
      const ws = new WebSocket('wss://ws.bitget.com/v2/ws/public');
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ instType: 'SPOT', channel: `candle${interval}`, instId: symbol }],
        }));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.data && Array.isArray(data.data)) {
            const c = data.data[0];
            const newCandle = {
              time: parseInt(c[0]),
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5]),
            };
            setCandles(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.time === newCandle.time) {
                updated[updated.length - 1] = newCandle;
              } else {
                updated.push(newCandle);
                if (updated.length > 100) updated.shift();
              }
              return updated;
            });
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) connectWS();
        }, 3000);
      };
    } catch (err) {
      console.error('WS connect error:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    setCandles([]);
    fetchCandles();
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [symbol, interval]);

  useEffect(() => {
    if (!candles.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 20, right: 20, bottom: 30, left: 65 };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060A10';
    ctx.fillRect(0, 0, W, H);

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const minP = Math.min(...lows) * 0.9995;
    const maxP = Math.max(...highs) * 1.0005;
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const scaleY = (p) => pad.top + (1 - (p - minP) / (maxP - minP)) * chartH;
    const candleW = Math.max(1.5, chartW / candles.length - 1);

    // Grid lines
    ctx.strokeStyle = '#1E2D45';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const y = pad.top + (i / gridCount) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      const price = maxP - (i / gridCount) * (maxP - minP);
      ctx.fillStyle = '#64748B';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(price > 1000 ? 1 : 4), pad.left - 4, y + 3);
    }
    ctx.setLineDash([]);

    // Candles
    candles.forEach((c, i) => {
      const x = pad.left + i * (chartW / candles.length);
      const cx = x + candleW / 2;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#00D68F' : '#FF4D6A';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, scaleY(c.high));
      ctx.lineTo(cx, scaleY(c.low));
      ctx.stroke();

      // Body
      const bodyTop = scaleY(Math.max(c.open, c.close));
      const bodyBot = scaleY(Math.min(c.open, c.close));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, candleW, bodyH);
    });

    // X axis time labels
    ctx.fillStyle = '#64748B';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(candles.length / 8));
    candles.forEach((c, i) => {
      if (i % step !== 0) return;
      const x = pad.left + i * (chartW / candles.length) + candleW / 2;
      const date = new Date(c.time);
      const label = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
      ctx.fillText(label, x, H - 8);
    });

    // Last price line
    if (candles.length > 0) {
      const lastClose = candles[candles.length - 1].close;
      const y = scaleY(lastClose);
      ctx.strokeStyle = '#1B6FF8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price label
      ctx.fillStyle = '#1B6FF8';
      ctx.fillRect(W - pad.right, y - 8, pad.right + 60, 16);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(lastClose.toFixed(lastClose > 1000 ? 1 : 4), W - pad.right + 4, y + 4);
    }

  }, [candles]);

  return (
    <div style={{
      position: 'relative',
      background: '#060A10',
      borderRadius: 6,
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)',
          background: '#060A10', zIndex: 2,
        }}>
          // Loading {symbol} chart...
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={900}
        height={height}
        style={{ width: '100%', height, display: 'block' }}
      />
      <div style={{
        position: 'absolute', top: 8, right: 8,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--green)',
          boxShadow: '0 0 6px var(--green)',
          animation: 'pulse 2s infinite',
        }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>LIVE</span>
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}