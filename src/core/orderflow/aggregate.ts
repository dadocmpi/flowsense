// ============================================
// AGGRESSOR-SIDE AGGREGATION (delta / CVD / book imbalance)
// ============================================
// Turns a stream of real aggressive prints into the numbers the panel and the
// Compass read: delta per candle, cumulative delta from the UTC session reset,
// and the resting-book imbalance.
//
// PURE and deterministic: given the same prints it produces the same numbers, so
// it is unit tested directly. The class is stateful only in the sense that it
// accumulates a live feed; it never reads a clock of its own, because every
// print carries its own venue timestamp.
//
// WHY PER-MINUTE BUCKETS. A day of gold-perp prints is far more than a ring can
// hold, so raw prints are folded into 1-minute buckets as they arrive and the
// prints themselves are discarded. Every timeframe is then rebuilt from those
// buckets, which is exact for every timeframe at or above one minute and bounds
// memory to a couple of days of minutes.

import type { BookLevel, CandleDelta, CvdPoint, TradePrint } from './types';
import { PriceHistogram } from './histogram';

/** One minute of aggressive flow. */
export interface MinuteBucket {
  /** Epoch ms of the minute open. */
  bucketStart: number;
  buy: number;
  sell: number;
  /** Number of prints folded into this minute. */
  trades: number;
}

/** Epoch ms of the UTC midnight that starts the session containing `ms`. */
export function utcResetBoundary(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Epoch ms of the bucket open containing `ms` for a bucket of `minutes`. */
export function bucketStart(ms: number, minutes: number): number {
  const span = minutes * 60_000;
  return Math.floor(ms / span) * span;
}

/**
 * Fold minute buckets into timeframe buckets since the reset boundary.
 *
 * The newest bucket (the one still forming) is EXCLUDED: the Compass must read
 * closed candles only. `count` bounds the series length.
 */
export function candleDeltas(
  minutes: MinuteBucket[],
  timeframeMinutes: number,
  resetAt: number,
  count: number
): CandleDelta[] {
  const span = timeframeMinutes * 60_000;
  const byBucket = new Map<number, CandleDelta>();

  for (const minute of minutes) {
    if (minute.bucketStart < resetAt) continue;
    const start = Math.floor(minute.bucketStart / span) * span;
    const existing = byBucket.get(start);
    if (existing) {
      existing.buyVolume += minute.buy;
      existing.sellVolume += minute.sell;
      existing.trades += minute.trades;
    } else {
      byBucket.set(start, {
        bucketStart: start,
        buyVolume: minute.buy,
        sellVolume: minute.sell,
        delta: 0,
        trades: minute.trades,
      });
    }
  }

  const ordered = [...byBucket.values()].sort((a, b) => a.bucketStart - b.bucketStart);
  for (const bucket of ordered) bucket.delta = bucket.buyVolume - bucket.sellVolume;

  // The last bucket is the forming one; the Compass never sees it.
  const closed = ordered.slice(0, -1);
  return count > 0 && closed.length > count ? closed.slice(closed.length - count) : closed;
}

/** Running sum of per-candle delta, oldest first. */
export function cvdSeries(deltas: CandleDelta[]): CvdPoint[] {
  const out: CvdPoint[] = [];
  let running = 0;
  for (const delta of deltas) {
    running += delta.delta;
    out.push({ bucketStart: delta.bucketStart, cvd: running, delta: delta.delta });
  }
  return out;
}

/** Sum of aggressive buy and sell volume over the candles. */
export function volumeTotals(deltas: CandleDelta[]): { buy: number; sell: number; volume: number } {
  let buy = 0;
  let sell = 0;
  for (const delta of deltas) {
    buy += delta.buyVolume;
    sell += delta.sellVolume;
  }
  return { buy, sell, volume: buy + sell };
}

/**
 * Resting-book imbalance over the top `levels` of each side:
 *
 *   (bidSize - askSize) / (bidSize + askSize)   ->  -1 (all offers) .. +1 (all bids)
 *
 * Returns null when there is no book to measure, never a zero standing in for a
 * missing reading.
 */
export function bookImbalance(bids: BookLevel[], asks: BookLevel[], levels: number): number | null {
  const n = Math.max(1, Math.floor(levels));
  const bidSize = bids.slice(0, n).reduce((sum, level) => sum + level.size, 0);
  const askSize = asks.slice(0, n).reduce((sum, level) => sum + level.size, 0);
  const total = bidSize + askSize;
  if (!Number.isFinite(total) || total <= 0) return null;
  return (bidSize - askSize) / total;
}

/** Cumulative size down each side of the ladder, for the depth bars. */
export function cumulativeSizes(levels: BookLevel[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (const level of levels) {
    running += level.size;
    out.push(running);
  }
  return out;
}

/** The largest cumulative size on either side, for scaling the depth bars. */
export function depthScale(bids: BookLevel[], asks: BookLevel[]): number {
  const bidCum = cumulativeSizes(bids);
  const askCum = cumulativeSizes(asks);
  return Math.max(1, ...bidCum, ...askCum);
}

/**
 * Live aggregator over the print stream. Bounded: it keeps two days of minute
 * buckets so the previous UTC session is available to the volume profile.
 */
export class FlowAggregator {
  private readonly buckets = new Map<number, MinuteBucket>();
  private readonly retentionMinutes: number;
  private readonly tickSize: number;
  private currentBins: PriceHistogram;
  private previousBins: PriceHistogram;
  private currentSessionStart: number | null = null;
  private previousSessionStart: number | null = null;
  private resetAtValue: number | null = null;
  private lastPrintAtValue: number | null = null;
  private totalPrints = 0;

  constructor(retentionMinutes = 2 * 24 * 60, tickSize = 0.01) {
    this.retentionMinutes = retentionMinutes;
    this.tickSize = tickSize;
    this.currentBins = new PriceHistogram(tickSize);
    this.previousBins = new PriceHistogram(tickSize);
  }

  /** Epoch ms of the current UTC session reset, once a print has arrived. */
  get resetAt(): number | null {
    return this.resetAtValue;
  }

  get lastPrintAt(): number | null {
    return this.lastPrintAtValue;
  }

  /** Total prints folded this session, for the feed-health readout. */
  get prints(): number {
    return this.totalPrints;
  }

  /** The current UTC session's volume-at-price histogram. */
  sessionHistogram(): PriceHistogram {
    return this.currentBins;
  }

  /** The previous UTC session's volume-at-price histogram. */
  previousHistogram(): PriceHistogram {
    return this.previousBins;
  }

  /** Epoch ms the current UTC session started, or null before the first print. */
  get currentSession(): number | null {
    return this.currentSessionStart;
  }

  /** Epoch ms the previous UTC session started, or null. */
  get previousSession(): number | null {
    return this.previousSessionStart;
  }

  /** Fold one print into its minute bucket and its session histogram. */
  ingest(print: TradePrint): void {
    const sessionStart = utcResetBoundary(print.time);
    if (this.currentSessionStart === null || sessionStart > this.currentSessionStart) {
      // A new UTC session: the old current becomes the previous one.
      this.previousBins = this.currentBins;
      this.previousSessionStart = this.currentSessionStart;
      this.currentBins = new PriceHistogram(this.tickSize);
      this.currentSessionStart = sessionStart;
    }
    if (this.resetAtValue === null || sessionStart > this.resetAtValue) {
      this.resetAtValue = sessionStart;
    }
    this.currentBins.ingest(print);

    const start = Math.floor(print.time / 60_000) * 60_000;
    const bucket = this.buckets.get(start);
    if (bucket) {
      if (print.side === 'BUY') bucket.buy += print.qty;
      else bucket.sell += print.qty;
      bucket.trades += 1;
    } else {
      this.buckets.set(start, {
        bucketStart: start,
        buy: print.side === 'BUY' ? print.qty : 0,
        sell: print.side === 'SELL' ? print.qty : 0,
        trades: 1,
      });
    }

    if (this.lastPrintAtValue === null || print.time > this.lastPrintAtValue) {
      this.lastPrintAtValue = print.time;
    }
    this.totalPrints += 1;

    // Bound memory: drop minutes older than the retention window.
    if (this.buckets.size > this.retentionMinutes + 120) {
      const cutoff = start - this.retentionMinutes * 60_000;
      for (const key of this.buckets.keys()) {
        if (key < cutoff) this.buckets.delete(key);
      }
    }
  }

  /** Every minute bucket, oldest first. */
  minuteBuckets(): MinuteBucket[] {
    return [...this.buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart);
  }

  /**
   * Minute buckets belonging to ONE UTC session: at or after its reset and
   * before the next reset, oldest first.
   */
  minuteBucketsForSession(sessionStart: number): MinuteBucket[] {
    const sessionEnd = sessionStart + 24 * 60 * 60_000;
    return this.minuteBuckets().filter(
      bucket => bucket.bucketStart >= sessionStart && bucket.bucketStart < sessionEnd
    );
  }

  /** The current session's own running totals, buy and sell. */
  sessionTotals(): { buy: number; sell: number; volume: number } {
    const resetAt = this.resetAtValue;
    if (resetAt === null) return { buy: 0, sell: 0, volume: 0 };
    let buy = 0;
    let sell = 0;
    for (const bucket of this.buckets.values()) {
      if (bucket.bucketStart < resetAt) continue;
      buy += bucket.buy;
      sell += bucket.sell;
    }
    return { buy, sell, volume: buy + sell };
  }

  clear(): void {
    this.buckets.clear();
    this.currentBins.clear();
    this.previousBins.clear();
    this.currentSessionStart = null;
    this.previousSessionStart = null;
    this.resetAtValue = null;
    this.lastPrintAtValue = null;
    this.totalPrints = 0;
  }
}
