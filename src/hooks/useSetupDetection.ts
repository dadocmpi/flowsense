import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SetupDetection,
  SetupType,
  SignalEngineConfig,
  DEFAULT_SIGNAL_CONFIG,
} from '../types/signalEngine';
import { TwelveDataState } from '../types/trading';

// ============================================
// LAYER 3: SETUP DETECTION
// ============================================
//
// The "trigger" layer. Most ticks → setup = NONE.
// Only escalates to a real setup when multiple conditions converge.
//

function calculateADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  let plusDM = 0, minusDM = 0, tr = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM += up > down && up > 0 ? up : 0;
    minusDM += down > up && down > 0 ? down : 0;
    tr += Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  
  const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
  const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
  const dxSum = plusDI + minusDI;
  if (dxSum === 0) return 0;
  return (Math.abs(plusDI - minusDI) / dxSum) * 100;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    sum += tr;
  }
  return sum / period;
}

export const useSetupDetection = (
  marketData: TwelveDataState,
  priceHistory: number[],
  manualZoneMin: number,
  manualZoneMax: number,
  manualZoneDirection: 'BUY' | 'SELL' | null,
  config: SignalEngineConfig = DEFAULT_SIGNAL_CONFIG
) => {
  const [setup, setSetup] = useState<SetupDetection | null>(null);
  const prevPriceRef = useRef<number>(0);
  const recentAbsorptionRef = useRef<{ time: number; side: 'BUY' | 'SELL' }[]>([]);

  const compute = useCallback(() => {
    const now = Date.now();
    const price = marketData.price;
    
    if (price <= 0 || priceHistory.length < 30) {
      setSetup({
        setup: 'NONE',
        triggered: false,
        direction: null,
        zonePriceMin: null,
        zonePriceMax: null,
        zoneMidpoint: null,
        touches: 0,
        absorptionScore: 0,
        regimeType: 'TRANSITION',
        regimeStrength: 0,
        volatilityAcceptable: false,
        liquidityAcceptable: false,
        conflictDetected: false,
        conflictType: null,
        lastUpdated: now,
      });
      return;
    }
    
    // ---- Regime Detection (ADX-based) ----
    // We don't have OHLC here, but we can approximate using high/low from recent trades
    const recentPrices = priceHistory.slice(-30);
    const syntheticHighs = recentPrices.map((p, i) => 
      i === 0 ? p : Math.max(p, recentPrices[i-1])
    );
    const syntheticLows = recentPrices.map((p, i) => 
      i === 0 ? p : Math.min(p, recentPrices[i-1])
    );
    
    const adx = calculateADX(syntheticHighs, syntheticLows, recentPrices, 14);
    const atr = calculateATR(syntheticHighs, syntheticLows, recentPrices, 14);
    
    const regimeType: 'TREND' | 'RANGE' | 'TRANSITION' = 
      adx > 25 ? 'TREND' : adx < 20 ? 'RANGE' : 'TRANSITION';
    const regimeStrength = Math.round(adx);
    
    // ---- Volatility acceptability ----
    const priceLevel = price;
    const atrRatio = (atr / priceLevel) * 100; // ATR as % of price
    const volatilityAcceptable = atrRatio < (config.maxVolatilityATR * 0.05); // 0.05% is normal
    
    // ---- Liquidity acceptability ----
    const liquidityAcceptable = marketData.institutionalPressure !== 'LOW';
    
    // ---- Zone proximity ----
    let inZone = false;
    let zoneMidpoint: number | null = null;
    let zoneMin: number | null = null;
    let zoneMax: number | null = null;
    let touches = 0;
    
    if (manualZoneMin > 0 && manualZoneMax > 0) {
      inZone = price >= manualZoneMin && price <= manualZoneMax;
      zoneMin = manualZoneMin;
      zoneMax = manualZoneMax;
      zoneMidpoint = (manualZoneMin + manualZoneMax) / 2;
      
      // Count historical touches (price entering zone in last 50 candles)
      touches = priceHistory.slice(-50).filter(p => 
        p >= manualZoneMin && p <= manualZoneMax
      ).length;
    }
    
    // ---- Absorption detection ----
    // Absorption = price in zone + delta going one way + price NOT following through
    if (inZone && marketData.recentTrades.length > 0) {
      const buyAggression = marketData.recentTrades.filter(t => t.type === 'BUY').length;
      const sellAggression = marketData.recentTrades.filter(t => t.type === 'SELL').length;
      const total = buyAggression + sellAggression || 1;
      const dominantSide: 'BUY' | 'SELL' = buyAggression > sellAggression ? 'BUY' : 'SELL';
      
      // Was there a recent spike in the dominant direction but price didn't move?
      const priceChange = price - prevPriceRef.current;
      const absChange = Math.abs(priceChange);
      const aggressionRatio = Math.max(buyAggression, sellAggression) / total;
      
      if (aggressionRatio > 0.7 && absChange < atr * 0.3) {
        // Aggressive orders flowing in but price absorbing — this is absorption
        recentAbsorptionRef.current.push({ time: now, side: dominantSide });
        // Keep only last 5 minutes
        recentAbsorptionRef.current = recentAbsorptionRef.current.filter(
          a => now - a.time < 5 * 60 * 1000
        );
      }
    }
    prevPriceRef.current = price;
    
    // ---- Conflict detection (RSI vs trend) ----
    // If RSI shows extreme oversold (mean reversion buy) but trend is strongly bearish,
    // that's a regime conflict — don't fire a signal.
    const rsi = marketData.oscillators.find(o => o.name.includes('RSI'));
    const rsiValue = rsi ? parseFloat(rsi.value) : 50;
    const rsiSaysBuy = rsiValue < 35;
    const rsiSaysSell = rsiValue > 65;
    
    // EMA cloud from market data
    const emaCloud = marketData.orderFlowIndicators.find(i => i.name.includes('EMA Cloud'));
    const trendDown = emaCloud?.action.includes('SELL');
    const trendUp = emaCloud?.action.includes('BUY');
    
    let conflictDetected = false;
    let conflictType: string | null = null;
    
    if (rsiSaysBuy && trendDown) {
      conflictDetected = true;
      conflictType = 'RSI oversold (mean reversion buy) vs bearish trend — regime conflict';
    } else if (rsiSaysSell && trendUp) {
      conflictDetected = true;
      conflictType = 'RSI overbought (mean reversion sell) vs bullish trend — regime conflict';
    }
    
    // ---- Setup classification ----
    let setupType: SetupType = 'NONE';
    let triggered = false;
    let direction: 'BUY' | 'SELL' | null = null;
    
    if (inZone && regimeStrength > 15 && liquidityAcceptable && !conflictDetected) {
      // We're in a zone with valid regime
      setupType = touches > 2 ? 'ORDER_BLOCK_RETEST' : 'INSTITUTIONAL_ACCUMULATION';
      triggered = true;
      direction = manualZoneDirection;
    } else if (inZone) {
      // We're in a zone but context is weak
      setupType = 'INSTITUTIONAL_ACCUMULATION';
      triggered = false;
      direction = manualZoneDirection;
    }
    
    // ---- Absorption score ----
    // 0..100 based on:
    //   - in zone: 30 points
    //   - delta alignment with direction: 25 points
    //   - multiple absorption events: 25 points  
    //   - regime strength: 20 points
    let absorptionScore = 0;
    if (inZone) absorptionScore += 30;
    
    const buyersPct = marketData.buyersPercent;
    if (direction === 'BUY' && buyersPct > 55) absorptionScore += 25;
    else if (direction === 'SELL' && buyersPct < 45) absorptionScore += 25;
    
    if (recentAbsorptionRef.current.length > 0) {
      absorptionScore += Math.min(25, recentAbsorptionRef.current.length * 8);
    }
    
    if (regimeStrength > 25) absorptionScore += 20;
    else if (regimeStrength > 15) absorptionScore += 10;
    
    setSetup({
      setup: setupType,
      triggered,
      direction,
      zonePriceMin: zoneMin,
      zonePriceMax: zoneMax,
      zoneMidpoint,
      touches,
      absorptionScore: Math.min(100, absorptionScore),
      regimeType,
      regimeStrength,
      volatilityAcceptable,
      liquidityAcceptable,
      conflictDetected,
      conflictType,
      lastUpdated: now,
    });
  }, [marketData, priceHistory, manualZoneMin, manualZoneMax, manualZoneDirection, config]);

  useEffect(() => {
    compute();
  }, [
    marketData.price,
    marketData.buyersPercent,
    marketData.institutionalPressure,
    marketData.recentTrades.length,
    compute,
  ]);

  return setup;
};