// ============================================================================
// MARKET STRUCTURE ENGINE
// ============================================================================
// Detects swing highs/lows, BOS, CHOCH, MSS, and trend state from price data.
// Pure functions - no React, no side effects.

import { MarketStructureState, StructureEvent, Timeframe, ZoneDirection } from './types';

/**
 * Configuration for structure detection.
 */
export interface StructureConfig {
  /** Minimum swing size in price units to count as a swing point. */
  minSwingSize: number;
  /** Number of recent swings to retain. */
  swingLookback: number;
}

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
  minSwingSize: 0.5, // tune per symbol
  swingLookback: 10,
};

/**
 * Find local swing highs and lows from a series of closing prices.
 * A swing high is a point higher than the `lookback` candles on each side.
 */
export function findSwings(
  closes: number[],
  lookback: number = 3,
  minSwingSize: number = 0
): { highs: { price: number; index: number }[]; lows: { price: number; index: number }[] } {
  const highs: { price: number; index: number }[] = [];
  const lows: { price: number; index: number }[] = [];

  for (let i = lookback; i < closes.length - lookback; i++) {
    const center = closes[i];

    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (closes[i - j] >= center || closes[i + j] >= center) isHigh = false;
      if (closes[i - j] <= center || closes[i + j] <= center) isLow = false;
    }

    if (isHigh) {
      if (highs.length === 0 || center - highs[highs.length - 1].price >= minSwingSize) {
        highs.push({ price: center, index: i });
      }
    }

    if (isLow) {
      if (lows.length === 0 || lows[lows.length - 1].price - center >= minSwingSize) {
        lows.push({ price: center, index: i });
      }
    }
  }

  return { highs, lows };
}

/**
 * Classify a swing as HH/HL/LH/LL based on previous swings.
 */
function classifySwings(
  highs: { price: number; index: number }[],
  lows: { price: number; index: number }[]
): StructureEvent[] {
  const events: StructureEvent[] = [];
  // Alternate sorted by index
  const combined = [
    ...highs.map(h => ({ ...h, kind: 'HIGH' as const })),
    ...lows.map(l => ({ ...l, kind: 'LOW' as const })),
  ].sort((a, b) => a.index - b.index);

  let lastHigh = -Infinity;
  let lastLow = Infinity;

  for (const p of combined) {
    if (p.kind === 'HIGH') {
      const dir: ZoneDirection = p.price > lastHigh ? 'BULLISH' : 'BEARISH';
      const type: StructureEvent['type'] = p.price > lastHigh ? 'HH' : 'LH';
      events.push({ type, direction: dir, timeframe: 'LTF', price: p.price, timestamp: p.index });
      lastHigh = p.price;
    } else {
      const dir: ZoneDirection = p.price < lastLow ? 'BEARISH' : 'BULLISH';
      const type: StructureEvent['type'] = p.price < lastLow ? 'LL' : 'HL';
      events.push({ type, direction: dir, timeframe: 'LTF', price: p.price, timestamp: p.index });
      lastLow = p.price;
    }
  }

  return events;
}

/**
 * Detect BOS (Break of Structure) and CHOCH (Change of Character).
 * BOS = continuation break in trend direction.
 * CHOCH = first break against the prevailing trend.
 */
function detectBOSandCHOCH(
  closes: number[],
  swings: { highs: { price: number; index: number }[]; lows: { price: number; index: number }[] }
): { bos: StructureEvent[]; choch: StructureEvent[] } {
  const bos: StructureEvent[] = [];
  const choch: StructureEvent[] = [];
  const { highs, lows } = swings;

  if (highs.length < 2 || lows.length < 2) return { bos, choch };

  // Determine initial trend from the first two swings
  const firstHigh = highs[0];
  const firstLow = lows[0];
  let trend: 'BULLISH' | 'BEARISH' = firstHigh.price > firstLow.price ? 'BULLISH' : 'BEARISH';

  // Iterate subsequent candles to detect breaks
  for (let i = 0; i < closes.length; i++) {
    // Check breaks against the most recent swing high/low
    for (let h = 0; h < highs.length; h++) {
      const sh = highs[h];
      if (i > sh.index && closes[i] > sh.price) {
        if (trend === 'BULLISH') {
          bos.push({ type: 'BOS', direction: 'BULLISH', timeframe: 'LTF', price: sh.price, timestamp: i });
        } else {
          choch.push({ type: 'CHOCH', direction: 'BULLISH', timeframe: 'LTF', price: sh.price, timestamp: i });
          trend = 'BULLISH';
        }
        break;
      }
    }
    for (let l = 0; l < lows.length; l++) {
      const sl = lows[l];
      if (i > sl.index && closes[i] < sl.price) {
        if (trend === 'BEARISH') {
          bos.push({ type: 'BOS', direction: 'BEARISH', timeframe: 'LTF', price: sl.price, timestamp: i });
        } else {
          choch.push({ type: 'CHOCH', direction: 'BEARISH', timeframe: 'LTF', price: sl.price, timestamp: i });
          trend = 'BEARISH';
        }
        break;
      }
    }
  }

  return { bos, choch };
}

/**
 * Build a complete market structure state for a given timeframe.
 */
export function buildMarketStructure(
  closes: number[],
  timeframe: Timeframe,
  config: StructureConfig = DEFAULT_STRUCTURE_CONFIG
): MarketStructureState {
  if (closes.length < 10) {
    return { timeframe, trend: 'RANGING', recentSwings: [] };
  }

  const swings = findSwings(closes, 3, config.minSwingSize);
  const events = classifySwings(swings.highs, swings.lows);
  const { bos, choch } = detectBOSandCHOCH(closes, swings);

  const lastBOS = bos[bos.length - 1];
  const lastCHOCH = choch[choch.length - 1];

  // Determine trend from most recent structural event
  let trend: MarketStructureState['trend'] = 'RANGING';
  const lastEvent = lastBOS || lastCHOCH;
  if (lastEvent) {
    trend = lastEvent.direction === 'BULLISH' ? 'BULLISH' : 'BEARISH';
  } else if (swings.highs.length >= 2) {
    trend = swings.highs[swings.highs.length - 1].price > swings.highs[swings.highs.length - 2].price
      ? 'BULLISH' : 'BEARISH';
  }

  const allEvents = [...events, ...bos, ...choch]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-config.swingLookback);

  return {
    timeframe,
    trend,
    lastBOS,
    lastCHOCH,
    recentSwings: allEvents,
  };
}

/**
 * Convert a structure trend to a directional bias contribution factor.
 */
export function structureTrendToBias(
  trend: MarketStructureState['trend']
): number {
  if (trend === 'BULLISH') return 1;
  if (trend === 'BEARISH') return -1;
  return 0;
}