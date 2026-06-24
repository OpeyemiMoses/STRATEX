import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

export default function Landing() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const handleLaunch = () => {
    if (isConnected) {
      navigate('/dashboard');
    } else {
      openConnectModal();
    }
  };

  return (
    <div>
      {/* Hero */}
      <div style={{ padding: '60px 20px 40px' }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--blue)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 16,
        }}>
          // Bitget AI Hackathon S1 · Powered by BITGET
        </div>

        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-1.5px',
          marginBottom: 16,
        }}>
          Describe a trade.<br />
          <span style={{ color: 'var(--blue)' }}>The AI checks itself before it runs.</span>
        </h1>

        <p style={{
          fontSize: 16,
          color: 'var(--text-mid)',
          maxWidth: 520,
          lineHeight: 1.6,
          marginBottom: 20,
        }}>
          Type any trading idea in plain English. Stratex
          analyses the risk, proposes a safer version before anything goes live.
          Once running, the AI keeps watching the position and can adjust your
          stop-loss or take-profit if conditions change — it can also
          audit its own decisions at any time.
        </p>

        {/* Honest paper-trading callout — leads with this rather than hiding it */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--bg2)',
          border: '1px solid rgba(0,214,143,0.25)',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 28,
          maxWidth: 520,
        }}>
          <span style={{ fontSize: 16 }}>🛡️</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--green)' }}>100% simulated paper trading.</strong>{' '}
            Every wallet starts with $10,000 in paper USDT and trades against real,
            live Bitget prices. No real funds, no real orders — every result is
            genuinely earned against the actual market.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleLaunch}
            style={{
              background: 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--sans)',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px var(--blue-glow)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            Launch App →
          </button>
          <button style={{
            background: 'var(--bg3)',
            color: 'var(--text-mid)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
          }}>
            View Docs
          </button>
        </div>
      </div>

      {/* How it works — reflects the actual flow: parse, clarify, risk-check,
          deploy, then ongoing monitoring + on-demand auditing */}
      <div style={{ padding: '40px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--mono)',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          How it works
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {[
            {
              n: '01',
              title: 'Describe your strategy',
              desc: 'Type your trading idea in plain English — entry, exit, even leverage. No coding needed.',
              icon: '✍️',
            },
            {
              n: '02',
              title: 'AI fills the gaps',
              desc: 'Missing a stop-loss, position size, or leverage call? The AI asks — quick-pick buttons or free text.',
              icon: '💬',
            },
            {
              n: '03',
              title: 'Risk-checked, with an alternative',
              desc: 'The AI analyses your strategy and proposes a safer version side-by-side. Pick either, or edit both.',
              icon: '⚖️',
            },
            {
              n: '04',
              title: 'Deploy — AI keeps watching',
              desc: "Once live, the AI monitors the position and can adjust stop-loss or take-profit if the market moves, logging its reasoning the whole way.",
              icon: '👁️',
            },
            {
              n: '05',
              title: 'Audit anytime',
              desc: 'Ask the AI to review any bot — active or closed — and flag mistakes or risk-management weaknesses in plain English.',
              icon: '🔍',
            },
          ].map(step => (
            <div
              key={step.n}
              data-reveal
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 20,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--blue)';
                e.currentTarget.style.boxShadow = '0 0 20px var(--blue-glow)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 10 }}>{step.icon}</div>
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--blue)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 8,
              }}>
                {step.n} //
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{step.title}</div>
              <p style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features — the depth beneath the 5-step flow */}
      <div style={{ padding: '40px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg1)' }}>
        <div style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--mono)',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          Built for real risk, not just real trades
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {[
            {
              icon: '⚡',
              title: 'Leverage, with real liquidation risk',
              desc: 'Ask for leverage and the AI walks you through it. Liquidation price is calculated and enforced — leverage here carries genuine downside, not just a bigger multiplier on the upside.',
            },
            {
              icon: '🛰️',
              title: 'Live decision console',
              desc: "Every risk re-check, every SL/TP adjustment, every audit flag — streamed live in a floating console so you can watch the AI's reasoning as it happens, not just the outcome.",
            },
            {
              icon: '🔍',
              title: 'AI auditing, on demand',
              desc: "Pull up any bot, active or archived, and ask the AI to review its own trade log and decisions. It will flag real issues — or tell you it found none.",
            },
            {
              icon: '📊',
              title: 'Wallet-wide pattern detection',
              desc: "Beyond single trades — the AI can review your entire wallet's history looking for repeated mistakes, ignored warnings, or habits worth knowing about.",
            },
            {
              icon: '💾',
              title: 'Shareable PnL cards',
              desc: 'Download a clean, branded snapshot of any live or closed position — exact live price, exact P&L, ready to share.',
            },
            {
              icon: '📜',
              title: 'Full trade history, exportable',
              desc: 'Every closed position is archived permanently with its full trade log. Copy any entry, or the entire history, as JSON.',
            },
          ].map((f, i) => (
            <div
              key={i}
              data-reveal
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{f.title}</div>
              <p style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Powered by */}
      <div style={{
        padding: '24px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Powered by
        </span>
        {['Bitget API', 'Qwen AI'].map(p => (
          <span key={p} style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--text-mid)',
            background: 'var(--bg3)',
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid var(--border)',
          }}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}