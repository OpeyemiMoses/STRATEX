import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function WalletBalance({ bots = [] }) {
  const { address, isConnected } = useAccount();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  if (!isConnected) return;
  const fetchWallet = async () => {
    try {
      const res = await fetch(`${API}/api/bots/wallet/${address}`);
      const data = await res.json();
      setWallet(data);
    } catch (err) {
      console.error('Wallet fetch error:', err);
    } finally {
      setLoading(false);
    }
  };
  fetchWallet(); // fetch immediately when bots change too
  const interval = setInterval(fetchWallet, 5000); // was 15000
  return () => clearInterval(interval);
}, [address, isConnected, bots]); // 👈 add bots as dependency

  if (!isConnected) return null;

const balance = wallet?.balance ?? 10000;
  const startingBalance = 10000;

  // Real total P&L = realized P&L (closed bots) + unrealized P&L (open bots)
  const realizedPnl = bots
    .filter(b => b.position === 'closed')
    .reduce((acc, b) => acc + (b.pnl || 0), 0);
  const unrealizedPnl = bots
    .filter(b => b.position === 'open')
    .reduce((acc, b) => acc + (b.unrealizedPnl || 0), 0);
  const pnl = realizedPnl + unrealizedPnl;
  const pnlPercent = (pnl / startingBalance) * 100;

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>Paper Trading Balance</span>
        {loading && <span style={{ color: 'var(--blue)' }}>// syncing...</span>}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}>
        {/* Available balance */}
        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: 12,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
            AVAILABLE BALANCE
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
            ${balance.toFixed(2)}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            USDT (simulated)
          </div>
        </div>

        {/* Starting balance */}
        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: 12,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
            STARTING BALANCE
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-mid)' }}>
            ${startingBalance.toFixed(2)}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            USDT (paper funds)
          </div>
        </div>

        {/* P&L */}
        <div style={{
          background: pnl >= 0 ? 'rgba(0,214,143,0.06)' : 'rgba(255,77,106,0.06)',
          border: `1px solid ${pnl >= 0 ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,106,0.2)'}`,
          borderRadius: 6,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
            TOTAL P&L
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: pnl >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}% all time
          </div>
        </div>
      </div>

      {wallet?.wasReset && (
        <div style={{
          marginTop: 12, padding: '8px 12px',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10, color: '#F59E0B',
        }}>
          ⚠ Balance was auto-reset to $10,000 after dropping below $100
        </div>
      )}
    </div>
  );
}