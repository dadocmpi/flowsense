import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMarketContext, MarketContext, Candle, ClusterConfig, DEFAULT_CLUSTER_CONFIG } from '../lib/context-engine';
import { SUPPORTED_ASSETS } from '../types/trading';

interface UseMarketContextInput {
  symbol: string;
  currentPrice: number;
  candles: Candle[];
  orderBookImbalance: number | null;
  volumeDelta: number | null;
  buyerDominance: number | null;
  hasOrderBook: boolean;
  hasTape: boolean;
  tapeTradeCount: number;
  orderBookLevels: number;
  lastTickerUpdate: number;
  lastTapeUpdate: number;
  lastDepthUpdate: number;
  clusterConfig?: ClusterConfig;
}

export const useMarketContext = (input: UseMarketContextInput): MarketContext | null => {
  const prevStateRef = useRef<MarketContext['state']>('WAITING');
  const [context, setContext] = useState<MarketContext | null>(null);

  const memoInput = useMemo(() => ({
    symbol: input.symbol,
    currentPrice: input.currentPrice,
    candles: input.candles,
    orderBookImbalance: input.orderBookImbalance,
    volumeDelta: input.volumeDelta,
    buyerDominance: input.buyerDominance,
    hasOrderBook: input.hasOrderBook,
    hasTape: input.hasTape,
    tapeTradeCount: input.tapeTradeCount,
    orderBookLevels: input.orderBookLevels,
    lastTickerUpdate: input.lastTickerUpdate,
    lastTapeUpdate: input.lastTapeUpdate,
    lastDepthUpdate: input.lastDepthUpdate,
    previousState: prevStateRef.current,
    clusterConfig: input.clusterConfig || DEFAULT_CLUSTER_CONFIG,
  }), [
    input.symbol,
    input.currentPrice,
    input.candles,
    input.orderBookImbalance,
    input.volumeDelta,
    input.buyerDominance,
    input.hasOrderBook,
    input.hasTape,
    input.tapeTradeCount,
    input.orderBookLevels,
    input.lastTickerUpdate,
    input.lastTapeUpdate,
    input.lastDepthUpdate,
  ]);

  useEffect(() => {
    if (input.currentPrice <= 0 || input.candles.length < 5) {
      return;
    }

    try {
      const { context: newContext } = buildMarketContext(memoInput);
      prevStateRef.current = newContext.state;
      setContext(newContext);
    } catch (err) {
      console.error('[useMarketContext] Failed to build context:', err);
    }
  }, [memoInput]);

  return context;
};