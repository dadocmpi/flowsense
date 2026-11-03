// ============================================
// BOOK FLOW — order-book imbalance
// ============================================
// BOOK FLOW is the resting-liquidity read: how much size is bid against how
// much is offered, within a band of the mid price. It is NOT the same thing as
// traded order flow, and it is never derived from prints — it comes from a real
// book, or it does not exist.
//
// Pure functions of a `DepthSnapshot`, so the panel and the thermal line can
// share one computation and a unit test can pin it.

import type { DepthSnapshot } from './providers/depth';
import { pressureFromRatio, type FlowReading, type PressureLevel } from './tickflow';

/** How many levels of each side the band covers. */
export const DEPTH_LEVELS = 20;

/**
 * How far from the mid the band reaches, as a fraction of the mid price.
 *
 * 0.1% either side is the near book: the liquidity a market order actually
 * trades against. A book is quoted to far more levels than that, and summing
 * the whole ladder would let distant, rarely-touched size dominate the read.
 */
export const DEPTH_BAND = 0.001;

function sumSide(levels: { price: number; size: number }[]): number {
  let total = 0;
  for (const level of levels) {
    if (Number.isFinite(level.size) && level.size > 0) total += level.size;
  }
  return total;
}

/**
 * Compute the book reading from a snapshot, or null when the book cannot
 * support an honest one (empty side, crossed book, or no valid mid).
 */
export function computeBookReading(snapshot: DepthSnapshot, levels = DEPTH_LEVELS): FlowReading | null {
  const bids = snapshot.bids.filter(l => Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.size) && l.size > 0);
  const asks = snapshot.asks.filter(l => Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.size) && l.size > 0);
  if (bids.length === 0 || asks.length === 0) return null;

  const bestBid = Math.max(...bids.map(l => l.price));
  const bestAsk = Math.min(...asks.map(l => l.price));
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestAsk <= bestBid) return null;

  const mid = (bestBid + bestAsk) / 2;
  const lower = mid * (1 - DEPTH_BAND);
  const upper = mid * (1 + DEPTH_BAND);

  const nearBids = bids.filter(l => l.price >= lower).slice(0, levels);
  const nearAsks = asks.filter(l => l.price <= upper).slice(0, levels);

  const bidVolume = sumSide(nearBids);
  const askVolume = sumSide(nearAsks);
  const totalVolume = bidVolume + askVolume;
  if (totalVolume <= 0) return null;

  const buyersPct = (bidVolume / totalVolume) * 100;
  const sellersPct = (askVolume / totalVolume) * 100;
  const volumeDelta = bidVolume - askVolume;
  const deltaRatio = Math.abs(volumeDelta) / totalVolume;

  return {
    buyVolume: bidVolume,
    sellVolume: askVolume,
    totalVolume,
    buyersPct,
    sellersPct,
    volumeDelta,
    deltaRatio,
    pressure: pressureFromRatio(deltaRatio) as PressureLevel,
    sampleCount: nearBids.length + nearAsks.length,
    basis: 'size',
    equilibrium: buyersPct / 100,
  };
}
