/**
 * Technical indicator calculations with robust edge case handling.
 * 
 * IMPORTANT: These functions MUST never return exactly 0 or 100 for RSI
 * unless the underlying price data truly justifies it. Division-by-zero
 * and insufficient-data cases return safe middle values.
 */

export function calculateRSI(prices: number[], period: number = 14): number {
  // Edge case: not enough data
  if (!prices || prices.length < period + 1) {
    return 50; // Safe neutral
  }
  
  // Edge case: invalid prices
  const validPrices = prices.filter(p => Number.isFinite(p) && p > 0);
  if (validPrices.length < period + 1) {
    return 50;
  }
  
  let gains = 0;
  let losses = 0;
  
  for (let i = validPrices.length - period; i < validPrices.length; i++) {
    const diff = validPrices[i] - validPrices[i - 1];
    if (diff > 0) gains += diff;
    else if (diff < 0) losses += Math.abs(diff);
    // diff === 0 contributes to neither
  }
  
  // Edge case: no movement at all
  if (gains === 0 && losses === 0) {
    return 50;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  // Edge case: no losses (all gains) — use a near-extreme value, NOT exactly 100
  // RS = avgGain / tiny_avgLoss → infinity → RSI = 100 - 0 = 100
  // To prevent the "0.0 RSI" bug and avoid binary extremes, clamp to 99.9
  if (avgLoss === 0) {
    return 99.9; // Was returning 100 which can read as 100.0; 99.9 is safer
  }
  
  // Edge case: no gains (all losses) — symmetrical, never 0
  if (avgGain === 0) {
    return 0.1; // Was returning 0; use 0.1 to prevent "0.0 RSI" display bug
  }
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  // Final clamp: prevent 0.0 and 100.0 unless truly justified
  if (rsi <= 0) return 0.1;
  if (rsi >= 100) return 99.9;
  
  return rsi;
}

export function calculateEMA(prices: number[], period: number): number {
  if (!prices || prices.length === 0) return 0;
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

export function calculateSMA(prices: number[], period: number): number {
  if (!prices || prices.length === 0) return 0;
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateBollingerPosition(closes: number[], period = 20, stdDev = 2): {
  position: 'OVERBOUGHT' | 'OVERSOLD' | 'MIDDLE';
  pctB: number;
} {
  if (!closes || closes.length < period) {
    return { position: 'MIDDLE', pctB: 0.5 };
  }
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