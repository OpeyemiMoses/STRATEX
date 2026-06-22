import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Simple module-level cache so we don't refetch the same icon across components
const iconCache = new Map();

export default function AssetIcon({ asset, size = 22, fallback = '⚡', fallbackColor = '#1B6FF8' }) {
  const [icon, setIcon] = useState(iconCache.get(asset) ?? undefined);

  useEffect(() => {
    if (!asset) return;
    if (iconCache.has(asset)) {
      setIcon(iconCache.get(asset));
      return;
    }

    let cancelled = false;
    const fetchIcon = async () => {
      try {
        const res = await fetch(`${API}/api/coingecko/icon/${asset}`);
        const data = await res.json();
        if (!cancelled) {
          iconCache.set(asset, data.image);
          setIcon(data.image);
        }
      } catch (err) {
        if (!cancelled) {
          iconCache.set(asset, null);
          setIcon(null);
        }
      }
    };
    fetchIcon();
    return () => { cancelled = true; };
  }, [asset]);

  if (icon) {
    return (
      <img
        src={icon}
        alt={asset}
        style={{ width: size, height: size, borderRadius: '50%' }}
        onError={() => setIcon(null)}
      />
    );
  }

  return <span style={{ color: fallbackColor, fontSize: size * 0.7 }}>{fallback}</span>;
}