import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useBots() {
  const { address } = useAccount();
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBots = async () => {
    if (!address) {
      setBots([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/bots?wallet=${address}`);
      const data = await res.json();
      setBots(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, [address]);

  const createBot = async (botData) => {
    try {
      const res = await fetch(`${API}/api/bots/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botData),
      });
      const newBot = await res.json();
      setBots(prev => [newBot, ...prev]);
      return newBot;
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleBot = async (id) => {
    const bot = bots.find(b => b.id === id);
    if (!bot) return;
    const newStatus = bot.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`${API}/api/bots/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setBots(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteBot = async (id) => {
    try {
      await fetch(`${API}/api/bots/${id}`, { method: 'DELETE' });
      setBots(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return { bots, loading, error, createBot, toggleBot, deleteBot, refetch: fetchBots };
}