// ============================================
// ESTIMATED PRICE LEVELS
// ============================================
// The "levels line" for an instrument with no real book: the price zones where
// the most activity happened, and the recent swing high / swing low. It is the
// candle-only stand-in for a volume-at-price / book map, and it is always
// labelled as an estimate.
//
// Activity is accumulated per price bin using the SAME activity proxy the order
// flow estimate uses (volume when present, otherwise the candle range), so the
// two panels agree about what "activity" means. Nothing here is a resting order:
// it is where trading already happened, not where liquidity is resting.
//
// Pure: no I/O, no clock, no React.

import type { Candle } from './types';
import { detectActivityProxy, candleWeight, type ActivityProxy } from './orderFlowEstimator';

export interface PriceZone {
  /** Bottom of the bin. */
  low: number;
  /** Top of the bin. */
  high: number;
  /** Bin midpoint, the label price. */
  mid: number;
  /** Accumulated activity in this bin. */
  activity: number;
  /** This bin's share of all activity, 0..1. */
  share: number;
}

export interface EstimatedLevels {
  available: boolean;
  /** Which activity proxy was used. */
  proxy: ActivityProxy;
  /** The busiest zones, highest activity first. */
  zones: PriceZone[];
  /** Highest high over the recent window. */
  swingHigh: number | null;
  /** Lowest low over the recent window. */
  swingLow: number | null;
  /** Last close. */
  price: number;
  /** Lowest low across the whole window (the bin range floor). */
  rangeLow: number;
  /** Highest high across the whole window (the bin range ceiling). */
  rangeHigh: number;
}

export interface EstimatedLevelsConfig {
  /** Number of price bins across the window's range. */
  bins: number;
  /** How many of the busiest zones to return. */
  topZones: number;
  /** Candles in the recent window used for the swing high / low. */
  swingLookback: number;
}

export const DEFAULT_ESTIMATED_LEVELS_CONFIG: EstimatedLevelsConfig = {
  bins: 24,
  topZones: 3,
  swingLookback: 20,
};

const EMPTY: EstimatedLevels = {
  available: false,
  proxy: 'range',
  zones: [],
  swingHigh: null,
  swingLow: null,
  price: 0,
  rangeLow: 0,
  rangeHigh: 0,
};

/**
 * Estimate the busiest price zones and the recent swing high / low from candles.
 *
 * The window is bucketed into equal price bins across its whole range; each
 * candle's activity (its volume, or its range when volume is unusable) is added
 * to the bin its close falls in. The busiest bins are the levels.
 */
export function estimatePriceLevels(
  candles: Candle[],
  config: EstimatedLevelsConfig = DEFAULT_ESTIMATED_LEVELS_CONFIG
): EstimatedLevels {
  if (candles.length === 0) return EMPTY;

  const proxy = detectActivityProxy(candles);
  const highs = candles.map(candle => candle.high);
  const lows = candles.map(candle => candle.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const price = candles[candles.length - 1].close;

  const swingStart = Math.max(0, candles.length - config.swingLookback);
  const swingHigh = Math.max(...highs.slice(swingStart));
  const swingLow = Math.min(...lows.slice(swingStart));

  const span = rangeHigh - rangeLow;
  // A zero-span window (every candle the same price) has no zones to show; the
  // swing levels and the price are still honest, so report them.
  if (span <= 0 || config.bins < 1) {
    return {
      available: false,
      proxy,
      zones: [],
      swingHigh,
      swingLow,
      price,
      rangeLow,
      rangeHigh,
    };
  }

  const binWidth = span / config.bins;
  const buckets = new Array(config.bins).fill(0) as number[];

  for (const candle of candles) {
    const index = Math.min(config.bins - 1, Math.max(0, Math.floor((candle.close - rangeLow) / binWidth)));
    buckets[index] += candleWeight(candle, proxy);
  }

  const total = buckets.reduce((sum, value) => sum + value, 0);
  const zones: PriceZone[] = buckets
    .map((activity, index) => ({
      low: rangeLow + index * binWidth,
      high: rangeLow + (index + 1) * binWidth,
      mid: rangeLow + (index + 0.5) * binWidth,
      activity,
      share: total > 0 ? activity / total : 0,
    }))
    .filter(zone => zone.activity > 0)
    .sort((a, b) => b.activity - a.activity)
    .slice(0, Math.max(1, config.topZones));

  return {
    available: zones.length > 0,
    proxy,
    zones,
    swingHigh,
    swingLow,
    price,
    rangeLow,
    rangeHigh,
  };
}
