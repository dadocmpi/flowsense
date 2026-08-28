// ============================================================================
// HISTORICAL CANDLES LOADER
// ============================================================================
// Loads candle history for structure analysis and zone detection.

import { useEffect, useState } from 'react';
import { Candle } from '../lib/context-engine';

export interface CandleHistoryState {
  candles: Candle[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: number;
}

export const useCandleHistory = (
  symbol: string,
  interval: string = '1m',
  limit: number = 200
): CandleHistoryState => {
  const [state, setState] = useState<CandleHistoryState>({
    candles: [],
    isLoading: true,
    error: null,
    lastUpdate: 0,
  });

  useEffect(() => {
    let isMounted = true;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    const loadCandles = async () => {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!Array.isArray(data)) throw new Error('Invalid response');

        const candles: Candle[] = data.map((k: any[]) => ({
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          timestamp: k[0],
        }));

        if (isMounted) {
          setState({
            candles,
            isLoading: false,
            error: null,
            lastUpdate: Date.now(),
          });
        }
      } catch (err) {
        if (isMounted) {
          setState({
            candles: [],
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load candles',
            lastUpdate: Date.now(),
          });
        }
      }
    };

    loadCandles();

    // Refresh every 60 seconds
    const refreshInterval = window.setInterval(loadCandles, 60_000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [symbol, interval, limit]);

  return state;
};