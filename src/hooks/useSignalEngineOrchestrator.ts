import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  SmoothedSignal, 
  SignalEngineConfig, 
  DEFAULT_SIGNAL_CONFIG 
} from '../types/signalEngine';
import { useMacroContext } from './useMacroContext';
import { useMultiTimeframe } from './useMultiTimeframe';
import { useSetupDetection } from './useSetupDetection';
import { useSignalEngine as useLayer4 } from './useSignalEngine';
import { TwelveDataState } from '../types/trading';
import { SUPPORTED_ASSETS } from '../types/trading';

// ============================================
// SIGNAL ENGINE ORCHESTRATOR
// ============================================
//
// Wires the 4 layers together. The UI only ever sees
// the SmoothedSignal from Layer 4.
//

interface OrchestratorState {
  signal: SmoothedSignal | null;
  priceHistory: number[];
  ema200: number | null;
  isReady: boolean;
}

export const useSignalEngineOrchestrator = (
  marketData: TwelveDataState,
  config: SignalEngineConfig = DEFAULT_SIGNAL_CONFIG
): OrchestratorState => {
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [ema200, setEma200] = useState<number | null>(null);
  
  // Update price history and EMA
  useEffect(() => {
    if (marketData.price <= 0) return;
    setPriceHistory(prev => {
      const next = [...prev.slice(-499), marketData.price];
      // Compute EMA200
      if (next.length >= 200) {
        const k = 2 / 201;
        let ema = next.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
        for (let i = 200; i < next.length; i++) {
          ema = next[i] * k + ema * (1 - k);
        }
        setEma200(ema);
      } else {
        setEma200(null);
      }
      return next;
    });
  }, [marketData.price]);
  
  // Layer 1: Macro
  const macro = useMacroContext(marketData.price, ema200, config);
  
  // Layer 2: Multi-timeframe
  const binanceSymbol = marketData.symbol === 'MGC1!' || marketData.symbol === 'XAU/USD'
    ? 'PAXGUSDT'
    : marketData.symbol === 'ES1!' ? 'BTCUSDT' : 'PAXGUSDT';
  const mtf = useMultiTimeframe(binanceSymbol, marketData.price, config);
  
  // Layer 3: Setup
  // Manual zone from localStorage (in production, lift to a shared state)
  const manualZoneMin = 0; // wired from Index.tsx
  const manualZoneMax = 0;
  const manualZoneDirection: 'BUY' | 'SELL' | null = null;
  const setup = useSetupDetection(
    marketData, 
    priceHistory, 
    manualZoneMin, 
    manualZoneMax, 
    manualZoneDirection, 
    config
  );
  
  // Layer 4: Smoothing + Hysteresis
  const signal = useLayer4({ macro, mtf, setup, rawMarketData: marketData }, config);
  
  return {
    signal,
    priceHistory,
    ema200,
    isReady: signal !== null,
  };
};