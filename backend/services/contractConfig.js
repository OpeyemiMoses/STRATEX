import axios from 'axios';

const CONTRACTS_URL = 'https://api.bitget.com/api/v2/mix/market/contracts';
const PRODUCT_TYPE = 'USDT-FUTURES';
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map(); // symbol -> { config, fetchedAt }

export const getContractConfig = async (symbol) => {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    const res = await axios.get(CONTRACTS_URL, {
      params: { symbol, productType: PRODUCT_TYPE },
    });
    const data = res.data?.data?.[0];
    if (!data) {
      cache.set(symbol, { config: null, fetchedAt: Date.now() });
      return null;
    }

    const config = {
      maxLever: parseFloat(data.maxLever) || 20, // conservative fallback if the field is ever missing
      minLever: parseFloat(data.minLever) || 1,
      minTradeNum: parseFloat(data.minTradeNum) || 0,
      fundInterval: parseFloat(data.fundInterval) || 8,
    };
    cache.set(symbol, { config, fetchedAt: Date.now() });
    return config;
  } catch (err) {
    console.error(`getContractConfig failed for ${symbol}:`, err.response?.data || err.message);
    return null; // not cached — a transient blip shouldn't lock in "unavailable" for the full TTL
  }
};

export const clampLeverage = async (symbol, requestedLeverage) => {
  const lev = parseFloat(requestedLeverage) || 1;
  const config = await getContractConfig(symbol);
  const maxLever = config?.maxLever ?? 125; // old flat assumption, only as a last-resort fallback
  const minLever = config?.minLever ?? 1;

  if (lev > maxLever) {
    return { leverage: maxLever, capped: true, requestedLeverage: lev, maxAllowedLeverage: maxLever };
  }
  if (lev < minLever) {
    return { leverage: minLever, capped: true, requestedLeverage: lev, maxAllowedLeverage: maxLever };
  }
  return { leverage: lev, capped: false, requestedLeverage: lev, maxAllowedLeverage: maxLever };
};