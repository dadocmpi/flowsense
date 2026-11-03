// ============================================
// TICK FLOW — tick rule + rolling window statistics
// ============================================
// A live price stream carries no aggressor flag, so the side of each print is
// inferred with the classic TICK RULE: a print above the previous one is a buy,
// below it is a sell, and an unchanged print inherits the previous side. That
// is an INFERENCE, not a vendor-reported aggressor side, and the UI says so.
//
// Everything here is a pure function of its inputs: no I/O, no clock, no
// React. The window statistics are what the live order-flow panel and the
// thermal line render, so they are pinned by unit tests.

export type TickSide = 'BUY' | 'SELL';

export type PressureLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** A raw print from the price stream. `size` is absent on a bare price feed. */
export interface FlowTick {
  price: number;
  /** Epoch ms the print was stamped with. */
  timestamp: number;
  /** Traded size, when the feed reports one. */
  size?: number;
}

/** A print with its side resolved by the tick rule. */
export interface ClassifiedTick extends FlowTick {
  side: TickSide;
  /** The size used in the sums: the real one, or 1 when none was reported. */
  size: number;
  /** True when `size` was assumed because the feed carried none. */
  sizeAssumed: boolean;
}

export interface FlowReading {
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  /** Share of the window's volume that was on the buy side, 0..100. */
  buyersPct: number;
  /** Share on the sell side, 0..100. */
  sellersPct: number;
  /** buyVolume - sellVolume over the window. */
  volumeDelta: number;
  /** |delta| / totalVolume, 0..1. */
  deltaRatio: number;
  pressure: PressureLevel;
  /** Number of prints the reading was computed from. */
  sampleCount: number;
  /**
   * 'size' when the feed reported sizes, 'tick-count' when every print counted
   * as one unit. The UI must label a tick-count delta as such.
   */
  basis: 'size' | 'tick-count';
  /** Buyers share as a 0..1 fraction, the thermal line's equilibrium point. */
  equilibrium: number;
}

/** The rolling window the live reading is measured over. */
export const TICK_WINDOW = 500;

/**
 * Pressure thresholds on |delta| / totalVolume.
 *
 * A window that is nearly balanced (a small absolute delta ratio) is LOW; a
 * window that is one-sided is HIGH. The cut-offs are exported so a test pins
 * them and the UI cannot quietly disagree.
 */
export const PRESSURE_LOW_MAX = 0.15;
export const PRESSURE_MEDIUM_MAX = 0.45;

export function pressureFromRatio(ratio: number): PressureLevel {
  if (!Number.isFinite(ratio) || ratio < PRESSURE_LOW_MAX) return 'LOW';
  if (ratio < PRESSURE_MEDIUM_MAX) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Classify a stream of prints with the tick rule.
 *
 * `previousSide` seeds the very first print, which has nothing to compare
 * against; it defaults to BUY so the series is deterministic. The returned
 * `lastSide` lets a caller carry the side across a chunk boundary, so a window
 * split across two flushes classifies identically to one whole series.
 */
export function classifyTicks(
  ticks: FlowTick[],
  previousSide: TickSide = 'BUY'
): { classified: ClassifiedTick[]; lastSide: TickSide } {
  const classified: ClassifiedTick[] = [];
  let side = previousSide;
  let previousPrice: number | null = null;

  for (const tick of ticks) {
    if (!Number.isFinite(tick.price) || tick.price <= 0) continue;

    if (previousPrice !== null) {
      if (tick.price > previousPrice) side = 'BUY';
      else if (tick.price < previousPrice) side = 'SELL';
      // Equal price: the side is inherited, which is the tick rule's tie-break.
    }
    previousPrice = tick.price;

    const sizeAssumed = tick.size === undefined || !Number.isFinite(tick.size) || tick.size <= 0;
    classified.push({
      ...tick,
      side,
      size: sizeAssumed ? 1 : (tick.size as number),
      sizeAssumed,
    });
  }

  return { classified, lastSide: side };
}

/** Summarise classified prints over the most recent `window` samples. */
export function computeFlowReading(classified: ClassifiedTick[], window: number = TICK_WINDOW): FlowReading {
  const slice = window > 0 ? classified.slice(-window) : classified;

  let buyVolume = 0;
  let sellVolume = 0;
  let anySizeAssumed = false;

  for (const tick of slice) {
    if (tick.side === 'BUY') buyVolume += tick.size;
    else sellVolume += tick.size;
    if (tick.sizeAssumed) anySizeAssumed = true;
  }

  const totalVolume = buyVolume + sellVolume;
  const buyersPct = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;
  const sellersPct = totalVolume > 0 ? (sellVolume / totalVolume) * 100 : 50;
  const volumeDelta = buyVolume - sellVolume;
  const deltaRatio = totalVolume > 0 ? Math.abs(volumeDelta) / totalVolume : 0;

  return {
    buyVolume,
    sellVolume,
    totalVolume,
    buyersPct,
    sellersPct,
    volumeDelta,
    deltaRatio,
    pressure: pressureFromRatio(deltaRatio),
    sampleCount: slice.length,
    basis: anySizeAssumed ? 'tick-count' : 'size',
    equilibrium: buyersPct / 100,
  };
}

/** An empty reading, for the honest "no feed" state (never a fabricated zero). */
export const EMPTY_FLOW_READING: FlowReading = {
  buyVolume: 0,
  sellVolume: 0,
  totalVolume: 0,
  buyersPct: 50,
  sellersPct: 50,
  volumeDelta: 0,
  deltaRatio: 0,
  pressure: 'LOW',
  sampleCount: 0,
  basis: 'tick-count',
  equilibrium: 0.5,
};

/**
 * Map a flow reading onto the compass's -100..+100 scale, so the live flow can
 * drive a gauge on the same axis as the other readings. A perfectly balanced
 * window is 0; a fully one-sided one is ±100.
 */
export function flowScore(reading: FlowReading): number {
  const score = (reading.buyersPct - 50) * 2;
  return Math.max(-100, Math.min(100, Number.isFinite(score) ? score : 0));
}
