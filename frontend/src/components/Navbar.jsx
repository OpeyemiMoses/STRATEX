import { Link, useLocation } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

const NAV_ICONS = {
  '/dashboard': '◧',
  '/bots': '⚡',
  '/create': '✦',
  '/signals': '📡',
  '/qwen': '🤖',
  '/history': '📜',
};

export default function Navbar() {
  const location = useLocation();
  const { isConnected } = useAccount();
  const isLanding = location.pathname === '/';

 const navLinks = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/bots', label: 'Bots' },
    { path: '/create', label: 'Strategies' },
    { path: '/signals', label: 'Signals' },
    { path: '/qwen', label: 'AI Analysis' },
    { path: '/history', label: 'History' },
  ];
  return (
    <>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 20px',
        height: 52,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Logo */}
        <Link to="/" style={{
          fontFamily: 'var(--mono)',
          fontWeight: 600,
          fontSize: 16,
          color: 'var(--text)',
          letterSpacing: '-0.5px',
          textDecoration: 'none',
          flexShrink: 0,
        }}>
          STRA<span style={{ color: 'var(--blue)' }}>TEX</span>
        </Link>

        {/* Nav Links — desktop only */}
        {!isLanding && isConnected && (
          <div className="navbar-desktop-links" style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  color: location.pathname === link.path ? 'var(--blue)' : 'var(--text-mid)',
                  background: location.pathname === link.path ? 'var(--bg3)' : 'transparent',
                  fontSize: 13,
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  borderBottom: location.pathname === link.path ? '2px solid var(--blue)' : '2px solid transparent',
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {/* Wallet Connect */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus="address"
          />
        </div>
      </nav>

      {/* Bottom tab bar — mobile only */}
      {!isLanding && isConnected && (
        <div className="navbar-mobile-tabs" style={{
          display: 'none',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 58,
          background: 'var(--bg1)',
          borderTop: '1px solid var(--border)',
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {navLinks.map(link => {
            const active = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  textDecoration: 'none',
                  color: active ? 'var(--blue)' : 'var(--text-dim)',
                }}
              >
                <span style={{ fontSize: 18 }}>{NAV_ICONS[link.path]}</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--mono)' }}>{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .navbar-desktop-links {
            display: none !important;
          }
          .navbar-mobile-tabs {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
}