// ============================================
// MARKET ANALYSIS — DERIVED FROM REAL CANDLES
// ============================================
// Everything here is computed from real OHLC candles. No randomness.

import {
  Candle,
  atr,
  bollingerBands,
  ema,
  macd,
  percentChange,
  pointOfControl,
  rsi,
  sma,
  volumeProfile,
  vwap,
} from './indicators';
import type { IndicatorSignal, IndicatorSummary, PriceRange } from '../types/trading';

const INTERVAL_MINUTES: Record<string, number> = {
  '1min': 1,
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '45min': 45,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '1day': 1440,
  '1week': 10080,
};

export function intervalToMinutes(interval: string): number {
  return INTERVAL_MINUTES[interval] ?? 5;
}

/**
 * Aggregates candles into larger buckets (e.g. 5min -> 15min) so higher
 * timeframes can be derived without spending extra API credits.
 */
export function aggregateCandles(candles: Candle[], bucketMinutes: number): Candle[] {
  if (bucketMinutes <= 0 || candles.length === 0) return [];

  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const time = new Date(candle.datetime.replace(' ', 'T')).getTime();
    if (!Number.isFinite(time)) continue;

    const bucketStart = Math.floor(time / (bucketMinutes * 60_000)) * bucketMinutes * 60_000;
    const existing = buckets.get(bucketStart);

    if (!existing) {
      buckets.set(bucketStart, { ...candle });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;

    // Keep the real aggressor split when aggregating, otherwise higher
    // timeframes would silently lose buy-initiated volume.
    if (candle.takerBuyVolume !== undefined || existing.takerBuyVolume !== undefined) {
      existing.takerBuyVolume = (existing.takerBuyVolume ?? 0) + (candle.takerBuyVolume ?? 0);
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, candle]) => ({ ...candle, datetime: new Date(time).toISOString() }));
}

function toRange(candles: Candle[]): PriceRange | null {
  if (candles.length === 0) return null;

  const high = Math.max(...candles.map(c => c.high));
  const low = Math.min(...candles.map(c => c.low));
  const open = candles[0].open;
  const close = candles[candles.length - 1].close;
  const startTime = new Date(candles[0].datetime.replace(' ', 'T')).getTime();

  return { high, low, open, close, startTime: Number.isFinite(startTime) ? startTime : Date.now() };
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export interface DerivedRanges {
  session: PriceRange | null;
  previousDay: PriceRange | null;
  weekly: PriceRange | null;
  openingRange: PriceRange | null;
}

export function deriveRanges(candles: Candle[]): DerivedRanges {
  if (candles.length === 0) {
    return { session: null, previousDay: null, weekly: null, openingRange: null };
  }

  const parsed = candles
    .map(candle => ({ candle, date: new Date(candle.datetime.replace(' ', 'T')) }))
    .filter(entry => Number.isFinite(entry.date.getTime()));

  if (parsed.length === 0) {
    return { session: null, previousDay: null, weekly: null, openingRange: null };
  }

  const lastDate = parsed[parsed.length - 1].date;

  const todayCandles = parsed.filter(entry => isSameUtcDay(entry.date, lastDate)).map(entry => entry.candle);

  // Previous day: the most recent full day before the last candle's day.
  const priorDays = parsed.filter(entry => !isSameUtcDay(entry.date, lastDate));
  let previousDayCandles: Candle[] = [];
  if (priorDays.length > 0) {
    const previousDate = priorDays[priorDays.length - 1].date;
    previousDayCandles = priorDays.filter(entry => isSameUtcDay(entry.date, previousDate)).map(entry => entry.candle);
  }

  // Weekly: everything within the last candle's ISO week.
  const weekStart = new Date(lastDate);
  const dayOfWeek = (weekStart.getUTCDay() + 6) % 7; // Monday = 0
  weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weeklyCandles = parsed.filter(entry => entry.date.getTime() >= weekStart.getTime()).map(entry => entry.candle);

  // Opening range: first 30 minutes of the current session.
  const openingRangeCandles = todayCandles.slice(0, 6);

  return {
    session: toRange(todayCandles),
    previousDay: toRange(previousDayCandles),
    weekly: toRange(weeklyCandles),
    openingRange: toRange(openingRangeCandles),
  };
}

function verdictFromScore(score: number): IndicatorSummary['verdict'] {
  if (score >= 75) return 'STRONG BUY';
  if (score >= 55) return 'BUY';
  if (score <= 25) return 'STRONG SELL';
  if (score <= 45) return 'SELL';
  return 'NEUTRAL';
}

export function buildSummary(signals: IndicatorSignal[]): IndicatorSummary {
  let buy = 0;
  let neutral = 0;
  let sell = 0;

  for (const signal of signals) {
    if (signal.action === 'STRONG BUY') buy += 2;
    else if (signal.action === 'BUY') buy += 1;
    else if (signal.action === 'STRONG SELL') sell += 2;
    else if (signal.action === 'SELL') sell += 1;
    else neutral += 1;
  }

  const directional = buy + sell;
  const score = directional === 0 ? 50 : Math.round((buy / directional) * 100);

  return { buyCount: buy, neutralCount: neutral, sellCount: sell, score, verdict: verdictFromScore(score) };
}

export interface IndicatorSet {
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  volumeIndicators: IndicatorSignal[];
  atr: number | null;
  vwap: number | null;
  pointOfControl: number | null;
}

export function buildIndicators(candles: Candle[], precision: number): IndicatorSet {
  const closes = candles.map(c => c.close).filter(Number.isFinite);
  const currentPrice = closes[closes.length - 1] ?? 0;

  const oscillators: IndicatorSignal[] = [];
  const movingAverages: IndicatorSignal[] = [];
  const volumeIndicators: IndicatorSignal[] = [];

  const format = (value: number) => value.toFixed(precision);

  // ---- RSI ----
  const rsiValue = rsi(closes, 14);
  if (rsiValue !== null) {
    oscillators.push({
      name: 'RSI (14)',
      value: rsiValue.toFixed(1),
      action:
        rsiValue >= 70 ? 'STRONG SELL' : rsiValue >= 60 ? 'SELL' : rsiValue <= 30 ? 'STRONG BUY' : rsiValue <= 40 ? 'BUY' : 'NEUTRAL',
      description: 'Momentum oscillator over the fetched window',
    });
  }

  // ---- MACD ----
  const macdResult = macd(closes, 12, 26, 9);
  if (macdResult) {
    oscillators.push({
      name: 'MACD (12, 26, 9)',
      value: macdResult.histogram.toFixed(Math.max(2, precision)),
      action: macdResult.histogram > 0 ? 'BUY' : macdResult.histogram < 0 ? 'SELL' : 'NEUTRAL',
      description: 'Histogram vs signal line',
    });
  }

  // ---- Bollinger Bands ----
  const bands = bollingerBands(closes, 20, 2);
  if (bands) {
    const position = currentPrice > bands.upper ? 'Above upper' : currentPrice < bands.lower ? 'Below lower' : 'Inside bands';
    oscillators.push({
      name: 'Bollinger Bands (20, 2)',
      value: position,
      action: currentPrice > bands.upper ? 'SELL' : currentPrice < bands.lower ? 'BUY' : 'NEUTRAL',
      description: `Upper ${format(bands.upper)} / Lower ${format(bands.lower)}`,
    });
  }

  // ---- Momentum ----
  const momentumLookback = Math.min(10, closes.length - 1);
  if (momentumLookback > 0) {
    const reference = closes[closes.length - 1 - momentumLookback];
    const momentumValue = currentPrice - reference;
    oscillators.push({
      name: `Momentum (${momentumLookback})`,
      value: format(momentumValue),
      action: momentumValue > 0 ? 'BUY' : momentumValue < 0 ? 'SELL' : 'NEUTRAL',
      description: `Change over the last ${momentumLookback} candles`,
    });
  }

  // ---- Moving averages ----
  const maDefinitions: Array<{ name: string; period: number; kind: 'EMA' | 'SMA' }> = [
    { name: 'EMA 10', period: 10, kind: 'EMA' },
    { name: 'EMA 20', period: 20, kind: 'EMA' },
    { name: 'EMA 50', period: 50, kind: 'EMA' },
    { name: 'SMA 50', period: 50, kind: 'SMA' },
    { name: 'EMA 200', period: 200, kind: 'EMA' },
  ];

  for (const definition of maDefinitions) {
    const value = definition.kind === 'EMA' ? ema(closes, definition.period) : sma(closes, definition.period);
    if (value === null) continue;

    const distance = percentChange(currentPrice, value);
    movingAverages.push({
      name: definition.name,
      value: format(value),
      action: distance > 0.05 ? 'BUY' : distance < -0.05 ? 'SELL' : 'NEUTRAL',
      description: `Price ${distance >= 0 ? '+' : ''}${distance.toFixed(2)}% vs ${definition.name}`,
    });
  }

  // ---- Volume indicators (from candle volume, not order flow) ----
  const volumes = candles.map(c => c.volume);
  const recentVolume = volumes.slice(-20);
  const avgVolume = recentVolume.length > 0 ? recentVolume.reduce((a, b) => a + b, 0) / recentVolume.length : 0;
  const lastVolume = volumes[volumes.length - 1] ?? 0;

  if (avgVolume > 0) {
    const volumeRatio = lastVolume / avgVolume;
    volumeIndicators.push({
      name: 'Volume vs 20-avg',
      value: `${volumeRatio.toFixed(2)}x`,
      action: volumeRatio > 1.5 ? (currentPrice >= (closes[closes.length - 2] ?? currentPrice) ? 'BUY' : 'SELL') : 'NEUTRAL',
      description: 'Candle volume relative to its 20-period average',
    });
  }

  const atrValue = atr(candles, 14);
  if (atrValue !== null) {
    volumeIndicators.push({
      name: 'ATR (14)',
      value: format(atrValue),
      action: 'NEUTRAL',
      description: `Average true range — ${((atrValue / (currentPrice || 1)) * 100).toFixed(2)}% of price`,
    });
  }

  const vwapValue = vwap(candles.slice(-78)); // ~1 trading day of 5min candles
  if (vwapValue !== null) {
    const distance = percentChange(currentPrice, vwapValue);
    volumeIndicators.push({
      name: 'VWAP',
      value: format(vwapValue),
      action: distance > 0.05 ? 'BUY' : distance < -0.05 ? 'SELL' : 'NEUTRAL',
      description: `Price ${distance >= 0 ? '+' : ''}${distance.toFixed(2)}% vs VWAP`,
    });
  }

  const poc = pointOfControl(volumeProfile(candles.slice(-200), 40));
  if (poc) {
    const distance = percentChange(currentPrice, poc.price);
    volumeIndicators.push({
      name: 'Volume POC',
      value: format(poc.price),
      action: distance > 0.1 ? 'BUY' : distance < -0.1 ? 'SELL' : 'NEUTRAL',
      description: 'Highest-volume price of the fetched window',
    });
  }

  return {
    oscillators,
    movingAverages,
    volumeIndicators,
    atr: atrValue,
    vwap: vwapValue,
    pointOfControl: poc ? poc.price : null,
  };
}
