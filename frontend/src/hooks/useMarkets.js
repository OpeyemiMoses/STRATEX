import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useMarkets() {
  const [trending, setTrending] = useState([]);
  const [memes, setMemes] = useState([]);
  const [l1s, setL1s] = useState([]);
  const [l2s, setL2s] = useState([]);
  const [whaleEvents, setWhaleEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [trendRes, memeRes, l1Res, l2Res, whaleRes] = await Promise.all([
        fetch(`${API}/api/coingecko/trending`),
        fetch(`${API}/api/coingecko/memes`),
        fetch(`${API}/api/coingecko/l1`),
        fetch(`${API}/api/coingecko/l2`),
        fetch(`${API}/api/whale/events`),
      ]);

      const [trend, meme, l1, l2, whale] = await Promise.all([
        trendRes.json(),
        memeRes.json(),
        l1Res.json(),
        l2Res.json(),
        whaleRes.json(),
      ]);

      setTrending(Array.isArray(trend) ? trend : []);
      setMemes(Array.isArray(meme) ? meme : []);
      setL1s(Array.isArray(l1) ? l1 : []);
      setL2s(Array.isArray(l2) ? l2 : []);
      setWhaleEvents(Array.isArray(whale) ? whale : []);
    } catch (err) {
      console.error('Markets fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, []);

  return { trending, memes, l1s, l2s, whaleEvents, loading, refetch: fetchAll };
}