import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useWallet() {
  const { address, isConnected } = useAccount();
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBalances = async () => {
    if (!address || !isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/wallet/${address}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBalances(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchBalances();
      const interval = setInterval(fetchBalances, 30000);
      return () => clearInterval(interval);
    }
  }, [address, isConnected]);

  return { balances, loading, error, refetch: fetchBalances };
}