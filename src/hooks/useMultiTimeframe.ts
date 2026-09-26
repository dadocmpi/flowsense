import { useMemo } from 'react';
import { Timeframe } from '../types/trading';
import type { Candle } from '../lib/indicators';
import { ema, rsi } from '../lib/indicators';
import { aggregateCandles, intervalToMinutes } from '../lib/marketAnalysis';

export interface TimeframeData {
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: number; // 0-100
  confidence: number; // 0-100
}

export interface MultiTimeframeResult {
  timeframes: TimeframeData[];
  weightedScore: number; // -100 to 100
  consensus: 'BUY' | 'SELL' | 'NEUTRAL';
}

const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
};

const TIMEFRAME_WEIGHTS: Record<Timeframe, number> = {
  '1m': 0.05,
  '5m': 0.10,
  '15m': 0.15,
  '1h': 0.20,
  '4h': 0.25,
  '1d': 0.25,
};

const MIN_CANDLES_PER_TIMEFRAME = 30;

/**
 * Scores a timeframe from its real candles using trend (EMA20 vs EMA50) and
 * momentum (RSI). Higher timeframes are aggregated from the base series, so
 * no extra API credits are consumed.
 */
function scoreTimeframe(candles: Candle[]): Omit<TimeframeData, 'timeframe'> | null {
  if (candles.length < MIN_CANDLES_PER_TIMEFRAME) return null;

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  if (!currentPrice) return null;

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiValue = rsi(closes, 14);
  if (ema20 === null || ema50 === null) return null;

  // Trend component: separation between fast and slow EMA, normalized by price.
  const trendSpread = ((ema20 - ema50) / currentPrice) * 100;
  const trendScore = Math.max(-1, Math.min(1, trendSpread / 1.5));

  // Momentum component: RSI distance from 50.
  const momentumScore = rsiValue === null ? 0 : Math.max(-1, Math.min(1, (rsiValue - 50) / 25));

  const composite = trendScore * 0.6 + momentumScore * 0.4;
  const strength = Math.round(Math.min(100, Math.abs(composite) * 100));

  const direction: TimeframeData['direction'] = composite > 0.15 ? 'BUY' : composite < -0.15 ? 'SELL' : 'NEUTRAL';

  // Confidence reflects how much data backs the timeframe and how decisive it is.
  const dataConfidence = Math.min(1, candles.length / 100);
  const confidence = Math.round(Math.max(30, Math.min(100, (0.5 + Math.abs(composite) * 0.5) * dataConfidence * 100)));

  return { direction, strength, confidence };
}

export const useMultiTimeframe = (baseCandles: Candle[], baseInterval = '5min'): MultiTimeframeResult | null => {
  return useMemo<MultiTimeframeResult | null>(() => {
    if (baseCandles.length === 0) return null;

    const baseMinutes = intervalToMinutes(baseInterval);
    const timeframesData: TimeframeData[] = [];

    (Object.keys(TIMEFRAME_MINUTES) as Timeframe[]).forEach(tf => {
      const minutes = TIMEFRAME_MINUTES[tf];
      const series = minutes <= baseMinutes ? baseCandles : aggregateCandles(baseCandles, minutes);

      const scored = scoreTimeframe(series);
      if (scored) timeframesData.push({ ...scored, timeframe: tf });
    });

    if (timeframesData.length === 0) return null;

    let weightedSum = 0;
    let totalWeight = 0;

    timeframesData.forEach(tfData => {
      const weight = TIMEFRAME_WEIGHTS[tfData.timeframe] || 0;
      const tfScore = tfData.direction === 'BUY' ? tfData.strength : tfData.direction === 'SELL' ? -tfData.strength : 0;
      weightedSum += tfScore * weight;
      totalWeight += weight;
    });

    const weightedScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    const consensus: MultiTimeframeResult['consensus'] =
      weightedScore >= 20 ? 'BUY' : weightedScore <= -20 ? 'SELL' : 'NEUTRAL';

    return { timeframes: timeframesData, weightedScore, consensus };
  }, [baseCandles, baseInterval]);
};
