// ============================================
// VOLUME PROFILE (real, from the tape)
// ============================================
// Volume-at-price built from REAL aggressive prints: how much volume traded at
// each price, split by aggressor side. From it come the point of control (the
// busiest price), the 70% value area (VAH/VAL) and the session high/low.
//
// This replaces the old candle-only "estimated zones" stand-in. It is where
// trading ACTUALLY happened, not where liquidity is resting, and it is computed
// from the venue's tape rather than inferred from candle ranges.
//
// Bins are sized by the instrument's tick, or by a derived "nice" step when no
// tick is configured, so the profile is dense but never thousands of rows.
//
// Pure: same prints, same profile.

import type { TradePrint } from './orderflow/types';
import type { HistogramEntry } from './orderflow/histogram';
import type { Candle } from './types';

export interface VolumeProfileBin {
  /** Bin lower edge. */
  low: number;
  /** Bin upper edge. */
  high: number;
  /** Bin midpoint, the label price. */
  mid: number;
  buy: number;
  sell: number;
  total: number;
  /** Share of total volume, 0..1. */
  share: number;
  /** True for bins inside the value area. */
  inValueArea: boolean;
}

export interface VolumeProfile {
  available: boolean;
  bins: VolumeProfileBin[];
  binSize: number;
  /** Point of control: the busiest price. */
  poc: number | null;
  /** Value-area high / low (70% of volume by default). */
  vah: number | null;
  val: number | null;
  /** The share of volume the value area was asked to cover. */
  valueAreaShare: number;
  sessionHigh: number | null;
  sessionLow: number | null;
  totalVolume: number;
  /** The session's reset boundary, epoch ms. */
  sessionStart: number | null;
  rangeLow: number;
  rangeHigh: number;
}

export interface VolumeProfileConfig {
  /** Instrument tick size; 0 or less derives a step from the range. */
  tickSize: number;
  /** Target bin count when the step is derived. */
  targetBins: number;
  /** Fraction of volume the value area covers (0.7 = the 70% area). */
  valueAreaShare: number;
}

export const DEFAULT_VOLUME_PROFILE_CONFIG: VolumeProfileConfig = {
  tickSize: 0,
  targetBins: 60,
  valueAreaShare: 0.7,
};

const EMPTY: VolumeProfile = {
  available: false,
  bins: [],
  binSize: 0,
  poc: null,
  vah: null,
  val: null,
  valueAreaShare: 0.7,
  sessionHigh: null,
  sessionLow: null,
  totalVolume: 0,
  sessionStart: null,
  rangeLow: 0,
  rangeHigh: 0,
};

/** The nearest 1 / 2 / 2.5 / 5 / 10 x 10^k step at or above `raw`. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalised = raw / magnitude;
  const factor = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return factor * magnitude;
}

/** The bin size to use: the configured tick, else a nice step over the range. */
export function chooseBinSize(range: number, config: VolumeProfileConfig): number {
  if (config.tickSize > 0) return config.tickSize;
  return niceStep(range / Math.max(1, config.targetBins));
}

/**
 * Assemble a profile from per-bin buy/sell volumes on a fixed grid.
 *
 * Shared by the print path and the live histogram path so both produce exactly
 * the same POC / value-area result.
 */
function assemble(
  buy: number[],
  sell: number[],
  firstBin: number,
  binSize: number,
  config: VolumeProfileConfig,
  sessionStart: number | null,
  candles: Candle[],
  fallbackRange: { low: number; high: number }
): VolumeProfile {
  const count = buy.length;
  let totalVolume = 0;
  let pocIndex = 0;
  for (let i = 0; i < count; i += 1) {
    totalVolume += buy[i] + sell[i];
    if (buy[i] + sell[i] > buy[pocIndex] + sell[pocIndex]) pocIndex = i;
  }
  if (totalVolume <= 0) return { ...EMPTY, valueAreaShare: config.valueAreaShare, sessionStart };

  const bins: VolumeProfileBin[] = [];
  for (let i = 0; i < count; i += 1) {
    const low = firstBin + i * binSize;
    const total = buy[i] + sell[i];
    bins.push({
      low,
      high: low + binSize,
      mid: low + binSize / 2,
      buy: buy[i],
      sell: sell[i],
      total,
      share: total / totalVolume,
      inValueArea: false,
    });
  }

  // Value area: expand from the POC into the larger neighbour until the target
  // share of volume is covered — the standard value-area expansion.
  const target = totalVolume * config.valueAreaShare;
  let lower = pocIndex;
  let upper = pocIndex;
  let covered = bins[pocIndex].total;
  while (covered < target && (lower > 0 || upper < count - 1)) {
    const below = lower > 0 ? bins[lower - 1].total : -1;
    const above = upper < count - 1 ? bins[upper + 1].total : -1;
    if (above >= below) {
      upper += 1;
      covered += Math.max(0, above);
    } else {
      lower -= 1;
      covered += Math.max(0, below);
    }
  }
  for (let i = lower; i <= upper; i += 1) bins[i].inValueArea = true;

  const highs = candles.map(candle => candle.high);
  const lows = candles.map(candle => candle.low);
  // Prefer the candle series for the session extremes; fall back to the real
  // traded price range, never to a bin edge that no trade actually reached.
  const sessionHigh = highs.length > 0 ? Math.max(...highs) : fallbackRange.high;
  const sessionLow = lows.length > 0 ? Math.min(...lows) : fallbackRange.low;

  return {
    available: true,
    bins,
    binSize,
    poc: bins[pocIndex].mid,
    vah: bins[upper].high,
    val: bins[lower].low,
    valueAreaShare: config.valueAreaShare,
    sessionHigh,
    sessionLow,
    totalVolume,
    sessionStart,
    rangeLow: bins[0].low,
    rangeHigh: bins[count - 1].high,
  };
}

/**
 * Build a profile from the live tick-sized histogram (the path the UI uses).
 *
 * The histogram holds one bin per traded tick, so no re-binning is needed; a
 * zero-filled gap between the lowest and highest traded price is inserted so the
 * profile reads as a continuous ladder rather than a scatter of levels.
 */
export function buildVolumeProfileFromHistogram(
  entries: HistogramEntry[],
  tickSize: number,
  config: VolumeProfileConfig = DEFAULT_VOLUME_PROFILE_CONFIG,
  sessionStart: number | null = null,
  candles: Candle[] = []
): VolumeProfile {
  if (entries.length === 0 || !(tickSize > 0)) {
    return { ...EMPTY, valueAreaShare: config.valueAreaShare, sessionStart };
  }
  const first = entries[0].index;
  const last = entries[entries.length - 1].index;
  const count = last - first + 1;
  if (count <= 0) return { ...EMPTY, valueAreaShare: config.valueAreaShare, sessionStart };

  const buy = new Array<number>(count).fill(0);
  const sell = new Array<number>(count).fill(0);
  for (const entry of entries) {
    const i = entry.index - first;
    if (i < 0 || i >= count) continue;
    buy[i] = entry.buy;
    sell[i] = entry.sell;
  }
  return assemble(buy, sell, first * tickSize, tickSize, config, sessionStart, candles, {
    low: first * tickSize,
    high: (last + 1) * tickSize,
  });
}

/**
 * Build a volume profile from real prints.
 *
 * `sessionStart` bounds the prints (they should already belong to one session);
 * `candles` optionally supply the session high/low from the price series.
 */
export function buildVolumeProfile(
  prints: TradePrint[],
  config: VolumeProfileConfig = DEFAULT_VOLUME_PROFILE_CONFIG,
  sessionStart: number | null = null,
  candles: Candle[] = []
): VolumeProfile {
  const usable = sessionStart === null ? prints : prints.filter(print => print.time >= sessionStart);
  if (usable.length === 0) return { ...EMPTY, valueAreaShare: config.valueAreaShare, sessionStart };

  let min = Infinity;
  let max = -Infinity;
  let totalVolume = 0;
  for (const print of usable) {
    if (print.price < min) min = print.price;
    if (print.price > max) max = print.price;
    totalVolume += print.qty;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || totalVolume <= 0) {
    return { ...EMPTY, valueAreaShare: config.valueAreaShare, sessionStart };
  }

  const range = max - min;
  const binSize = chooseBinSize(range, config);
  const firstBin = Math.floor(min / binSize) * binSize;
  const lastBin = Math.floor(max / binSize) * binSize;
  const count = Math.max(1, Math.round((lastBin - firstBin) / binSize) + 1);

  const buy = new Array<number>(count).fill(0);
  const sell = new Array<number>(count).fill(0);
  for (const print of usable) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((print.price - firstBin) / binSize)));
    if (print.side === 'BUY') buy[index] += print.qty;
    else sell[index] += print.qty;
  }

  return assemble(buy, sell, firstBin, binSize, config, sessionStart, candles, { low: min, high: max });
}
