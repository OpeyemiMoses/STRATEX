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
          // Bitget AI Hackathon S1 · Powered by Qwen
        </div>

        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-1.5px',
          marginBottom: 16,
        }}>
          Describe a trade.<br />
          <span style={{ color: 'var(--blue)' }}>We build the bot.</span>
        </h1>

        <p style={{
          fontSize: 16,
          color: 'var(--text-mid)',
          maxWidth: 480,
          lineHeight: 1.6,
          marginBottom: 28,
        }}>
          Type any trading idea in plain English. Stratex turns it into an
          autonomous trading bot — backtested, deployed, and running 24/7 on Bitget.
          No code required.
        </p>

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

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg1)',
        overflowX: 'auto',
      }}>
        {[
          { label: 'Total Bots Deployed', value: '1,234' },
          { label: 'Avg Win Rate', value: '64.2%' },
          { label: 'Total Volume', value: '$4.2M' },
          { label: 'Strategies Created', value: '3,891' },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1,
            minWidth: 140,
            padding: '16px 20px',
            borderRight: i < 3 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--blue)' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ padding: '40px 20px' }}>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}>
          {[
            {
              n: '01',
              title: 'Describe your strategy',
              desc: 'Type your trading idea in plain English. RSI levels, price conditions, sentiment signals — anything. No coding needed.',
              icon: '✍️',
            },
            {
              n: '02',
              title: 'AI builds & backtests it',
              desc: 'Stratex AI parses your idea, generates the strategy logic, and runs it against real historical market data instantly.',
              icon: '⚡',
            },
            {
              n: '03',
              title: 'Deploy and let it run',
              desc: 'Launch your bot on Bitget. It monitors the market and executes trades automatically, 24 hours a day, 7 days a week.',
              icon: '🚀',
            },
          ].map(step => (
            <div
              key={step.n}
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
        {['Bitget', 'Qwen AI', 'Agent Hub', 'RainbowKit'].map(p => (
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