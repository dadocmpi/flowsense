import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MultiTimeframeResult,
  TimeframeConfluence,
  Timeframe,
  SignalEngineConfig,
  DEFAULT_SIGNAL_CONFIG,
} from '../types/signalEngine';

interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateBollingerPosition(closes: number[], period = 20, stdDev = 2): {
  position: 'OVERBOUGHT' | 'OVERSOLD' | 'MIDDLE';
  pctB: number;
} {
  if (closes.length < period) return { position: 'MIDDLE', pctB: 0.5 };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sq, n) => sq + Math.pow(n - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const current = closes[closes.length - 1];
  const pctB = std > 0 ? (current - lower) / (upper - lower) : 0.5;
  
  let position: 'OVERBOUGHT' | 'OVERSOLD' | 'MIDDLE' = 'MIDDLE';
  if (pctB > 0.95) position = 'OVERBOUGHT';
  else if (pctB < 0.05) position = 'OVERSOLD';
  
  return { position, pctB };
}

async function fetchCandles(
  binanceSymbol: string,
  interval: string,
  limit: number = 200
): Promise<CandleData[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return data.map((k: any[]) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    return [];
  }
}

const TF_TO_BINANCE: Record<Timeframe, string> = {
  M5: '5m',
  M15: '15m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
};

function computeTimeframeConfluence(
  candles: CandleData[],
  weight: number,
  timeframe: Timeframe
): TimeframeConfluence {
  if (candles.length < 30) {
    return {
      timeframe,
      weight,
      score: 0,
      direction: 'NEUTRAL',
      trend: 'FLAT',
      rsi: 50,
      emaCloudBias: 'NEUTRAL',
      bollingerPosition: 'MIDDLE',
      momentum: 0,
      lastUpdated: Date.now(),
    };
  }
  
  const closes = candles.map(c => c.close);
  const current = closes[closes.length - 1];
  
  const ema10 = calculateEMA(closes, 10);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  
  const emaCloudBias: 'BULL' | 'BEAR' | 'NEUTRAL' = 
    (current > ema10 && current > ema20 && current > ema50 && current > ema200) ? 'BULL' :
    (current < ema10 && current < ema20 && current < ema50 && current < ema200) ? 'BEAR' :
    (current > ema200) ? 'BULL' : (current < ema200) ? 'BEAR' : 'NEUTRAL';
  
  const rsi = calculateRSI(closes, 14);
  let rsiBias: number = 0;
  if (rsi > 70) rsiBias = -20;
  else if (rsi > 60) rsiBias = -5;
  else if (rsi < 30) rsiBias = 20;
  else if (rsi < 40) rsiBias = 5;
  
  const boll = calculateBollingerPosition(closes);
  let bollBias = 0;
  if (boll.position === 'OVERSOLD') bollBias = 10;
  else if (boll.position === 'OVERBOUGHT') bollBias = -10;
  
  const momentum = closes.length >= 10 
    ? current - closes[closes.length - 10] 
    : 0;
  const momBias = Math.max(-30, Math.min(30, momentum * 2));
  
  const trend: 'UP' | 'DOWN' | 'FLAT' = 
    emaCloudBias === 'BULL' ? 'UP' :
    emaCloudBias === 'BEAR' ? 'DOWN' : 'FLAT';
  
  let score = rsiBias + bollBias + momBias;
  if (emaCloudBias === 'BULL') score += 40;
  else if (emaCloudBias === 'BEAR') score -= 40;
  
  score = Math.max(-100, Math.min(100, score));
  
  const direction: 'BUY' | 'SELL' | 'NEUTRAL' = 
    score > 15 ? 'BUY' :
    score < -15 ? 'SELL' : 'NEUTRAL';
  
  return {
    timeframe,
    weight,
    score,
    direction,
    trend,
    rsi,
    emaCloudBias,
    bollingerPosition: boll.position,
    momentum,
    lastUpdated: Date.now(),
  };
}

export const useMultiTimeframe = (
  binanceSymbol: string,
  currentPrice: number,
  config: SignalEngineConfig = DEFAULT_SIGNAL_CONFIG
) => {
  const [result, setResult] = useState<MultiTimeframeResult | null>(null);
  const lastFetchRef = useRef<Record<Timeframe, number>>({} as any);
  const cacheRef = useRef<Record<Timeframe, CandleData[]>>({} as any);
  
  const fetchAll = useCallback(async () => {
    const now = Date.now();
    const newResult: MultiTimeframeResult = {
      weightedScore: 0,
      agreementPercent: 0,
      dominantDirection: 'NEUTRAL',
      timeframes: [],
      alignmentMet: false,
      lastUpdated: now,
    };
    
    let totalWeight = 0;
    let weightedSum = 0;
    let buyCount = 0;
    let sellCount = 0;
    let neutralCount = 0;
    
    for (const tf of config.mtfTimeframes) {
      const lastFetch = lastFetchRef.current[tf] || 0;
      const interval = TF_TO_BINANCE[tf];
      
      const refreshMs = tf === 'M5' ? 30_000 : tf === 'M15' ? 60_000 : 5 * 60_000;
      
      if (now - lastFetch > refreshMs || !cacheRef.current[tf] || cacheRef.current[tf].length === 0) {
        const candles = await fetchCandles(binanceSymbol, interval, 200);
        if (candles.length > 0) {
          cacheRef.current[tf] = candles;
          lastFetchRef.current[tf] = now;
        }
      }
      
      const candles = cacheRef.current[tf] || [];
      const weight = config.mtfWeights[tf] || 0.2;
      const tfResult = computeTimeframeConfluence(candles, weight, tf);
      if (currentPrice > 0 && tf === 'M5') {
        tfResult.score = (tfResult.score * 0.7) + (currentPrice > candles[candles.length-1]?.close ? 5 : -5);
      }
      
      newResult.timeframes.push(tfResult);
      weightedSum += tfResult.score * weight;
      totalWeight += weight;
      
      if (tfResult.direction === 'BUY') buyCount++;
      else if (tfResult.direction === 'SELL') sellCount++;
      else neutralCount++;
    }
    
    newResult.weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    const totalTfs = newResult.timeframes.length || 1;
    const dominantCount = Math.max(buyCount, sellCount, neutralCount);
    newResult.agreementPercent = (dominantCount / totalTfs) * 100;
    
    if (buyCount > sellCount && buyCount > neutralCount) {
      newResult.dominantDirection = 'BUY';
    } else if (sellCount > buyCount && sellCount > neutralCount) {
      newResult.dominantDirection = 'SELL';
    } else {
      newResult.dominantDirection = 'NEUTRAL';
    }
    
    newResult.alignmentMet = 
      (newResult.agreementPercent / 100) >= config.mtfAgreementThreshold &&
      newResult.dominantDirection !== 'NEUTRAL';
    
    setResult(newResult);
  }, [binanceSymbol, currentPrice, config]);
  
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return result;
};