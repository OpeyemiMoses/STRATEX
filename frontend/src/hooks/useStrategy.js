import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useStrategy() {
  const [strategy, setStrategy] = useState(null);
  const [backtestResults, setBacktestResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [error, setError] = useState(null);

  const parseStrategy = async ({ input, asset, timeframe, stopLoss, takeProfit, positionSize }) => {
    setLoading(true);
    setError(null);
    setStrategy(null);
    try {
      const res = await fetch(`${API}/api/strategy/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, asset, timeframe, stopLoss, takeProfit, positionSize }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStrategy(data.strategy);
      return data.strategy;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async ({ strategy, asset, timeframe, stopLoss, takeProfit, positionSize }) => {
    setBacktestLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, asset, timeframe, stopLoss, takeProfit, positionSize }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBacktestResults(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBacktestLoading(false);
    }
  };

  const reset = () => {
    setStrategy(null);
    setBacktestResults(null);
    setError(null);
  };

  return {
    strategy,
    backtestResults,
    loading,
    backtestLoading,
    error,
    parseStrategy,
    runBacktest,
    reset,
  };
}