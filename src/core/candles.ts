// ============================================
// CANDLE UTILITIES
// ============================================

import type { Candle, Timeframe } from './types';
import { TIMEFRAME_MINUTES } from './types';

/** Parse the "YYYY-MM-DD HH:MM:SS" (UTC) form the providers emit. */
export function parseCandleTime(datetime: string): number {
  const normalized = datetime.includes('T') ? datetime : datetime.replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  return new Date(withZone).getTime();
}

/** Format a millisecond timestamp in the shared UTC candle form. */
export function formatCandleTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * Aggregate candles into larger buckets. Volume is summed and the taker-buy
 * split is summed only when at least one source candle actually carried it —
 * higher timeframes must never invent an aggressor split they were not given.
 */
export function aggregateCandles(candles: Candle[], bucketMinutes: number): Candle[] {
  if (bucketMinutes <= 0 || candles.length === 0) return [];

  const buckets = new Map<number, Candle>();
  const hasSplit = new Map<number, boolean>();

  for (const candle of candles) {
    const time = parseCandleTime(candle.datetime);
    if (!Number.isFinite(time)) continue;

    const bucketStart = Math.floor(time / (bucketMinutes * 60_000)) * bucketMinutes * 60_000;
    const existing = buckets.get(bucketStart);

    if (!existing) {
      buckets.set(bucketStart, { ...candle, takerBuyVolume: candle.takerBuyVolume });
      hasSplit.set(bucketStart, candle.takerBuyVolume !== undefined);
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;

    if (candle.takerBuyVolume !== undefined) {
      existing.takerBuyVolume = (existing.takerBuyVolume ?? 0) + candle.takerBuyVolume;
      hasSplit.set(bucketStart, true);
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, candle]) => ({
      ...candle,
      datetime: formatCandleTime(time),
      ...(hasSplit.get(time) ? {} : { takerBuyVolume: undefined }),
    }));
}

/**
 * Resample a candle series to a target timeframe. `baseMinutes` is the spacing
 * of the input series; a target shorter than or equal to it is returned as-is
 * (never synthesised at a finer resolution).
 */
export function resampleCandles(candles: Candle[], timeframe: Timeframe, baseMinutes: number): Candle[] {
  const minutes = TIMEFRAME_MINUTES[timeframe];
  if (minutes <= baseMinutes) return candles;
  return aggregateCandles(candles, minutes);
}

/** Overwrite the newest candle of a series, or append it when it is new. */
export function upsertLastCandle(series: Candle[], candle: Candle): Candle[] {
  if (series.length === 0) return [candle];
  const last = series[series.length - 1];

  if (candle.datetime === last.datetime) return [...series.slice(0, -1), candle];
  if (candle.datetime > last.datetime) return [...series, candle];
  return series;
}

/** Keep the series sorted oldest-first and free of duplicate open times. */
export function normalizeSeries(candles: Candle[]): Candle[] {
  const byTime = new Map<string, Candle>();
  for (const candle of candles) {
    if (!candle.datetime) continue;
    byTime.set(candle.datetime, candle);
  }
  return [...byTime.values()].sort((a, b) => a.datetime.localeCompare(b.datetime));
}
