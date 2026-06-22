import { useState, useEffect } from 'react';

export default function AIPanel({ content, streaming }) {
  const [displayed, setDisplayed] = useState([]);

  useEffect(() => {
    if (!content) { setDisplayed([]); return; }

    if (!streaming) {
      setDisplayed(content.split('').map((c, i) => ({ c, i })));
      return;
    }

    setDisplayed([]);
    let i = 0;
    const chars = content.split('');
    const t = setInterval(() => {
      if (i >= chars.length) { clearInterval(t); return; }
      setDisplayed(prev => [...prev, { c: chars[i], i }]);
      i++;
    }, 12);

    return () => clearInterval(t);
  }, [content, streaming]);

  return (
    <div style={{
      background: '#060A10',
      border: '1px solid var(--border)',
      borderRadius: 6,
      fontFamily: 'var(--mono)',
      fontSize: 12,
      color: '#7DD3FC',
      padding: 14,
      minHeight: 180,
      lineHeight: 1.9,
      position: 'relative',
      overflow: 'hidden',
      whiteSpace: 'pre-wrap',
    }}>
      {/* Header */}
      <div style={{
        fontSize: 10,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: 'var(--blue)' }}>▶</span>
        STRATEX_AI · STRATEGY PREVIEW
      </div>

      {/* Content */}
      {!content ? (
        <span style={{ color: 'var(--text-dim)' }}>
          {'// Waiting for your strategy input...\n// Describe your trade above and click Build Strategy.'}
        </span>
      ) : (
        <>
          {displayed.map(({ c, i }) => (
            <span
              key={i}
              style={{
                display: 'inline',
                animation: 'pixelIn 0.35s ease forwards',
                animationDelay: `${Math.min(i * 0.008, 2)}s`,
                opacity: 0,
                color: c === '\n' ? undefined :
                  ['B','U','Y','S','E','L','L'].includes(c) ? '#7DD3FC' :
                  c === ':' ? 'var(--text-dim)' : '#7DD3FC',
              }}
            >
              {c}
            </span>
          ))}
          {streaming && displayed.length < (content?.length || 0) && (
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 14,
              background: 'var(--blue)',
              animation: 'blink 1s step-end infinite',
              verticalAlign: 'middle',
              marginLeft: 2,
            }} />
          )}
        </>
      )}

      <style>{`
        @keyframes pixelIn {
          0% { opacity: 0; filter: blur(4px) brightness(2); letter-spacing: 0.3em; }
          40% { opacity: 0.7; filter: blur(1px) brightness(1.4); letter-spacing: 0.05em; }
          100% { opacity: 1; filter: blur(0) brightness(1); letter-spacing: 0; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}