// ============================================
// COMPASS CONFIGURATION
// ============================================
// One file holds every tunable that shapes the compass: the vote thresholds,
// the moving-average tolerance band, the per-indicator weights and the per
// timeframe weights.
//
// The scoring code reads this object; nothing is hardcoded downstream.

import type { Timeframe } from '../core/types';

export interface EntryCheckConfig {
  /**
   * Timeframes treated as "higher" for the higher-timeframe rule. The default
   * starts at 1H: an intraday entry that fights the 1H-and-above trend is the
   * one worth warning about.
   */
  higherTimeframes: Timeframe[];
  /** Warn (and never report ALIGNED) when a higher timeframe disagrees. */
  warnOnHigherTimeframeDisagreement: boolean;
  /**
   * Share of the weighted directional vote that must agree before the verdict
   * can be ALIGNED. Measured only across timeframes that actually took a side,
   * so a neutral timeframe neither helps nor hurts.
   */
  alignedShare: number;
  /** Below this share the verdict is AGAINST rather than PARTIAL. */
  againstShare: number;
}

export interface CompassConfig {
  /**
   * Tolerance band, as a percentage of price, inside which a price-vs-level
   * comparison is Neutral rather than Buy/Sell. Used by the moving averages.
   */
  maTolerancePercent: number;

  /** Weight each moving average carries inside the MA gauge. */
  maWeights: Record<string, number>;

  /** Weight each technical indicator carries inside the indicators gauge. */
  indicatorWeights: Record<string, number>;

  /**
   * Blend between the two gauges when forming the per-timeframe summary.
   * These are normalised, so only the ratio matters.
   */
  gaugeBlend: {
    movingAverages: number;
    indicators: number;
  };

  /** How each timeframe's reading contributes to the multi-timeframe confluence. */
  timeframeWeights: Record<Timeframe, number>;

  /** Rules behind the LONG / SHORT entry check. */
  entryCheck: EntryCheckConfig;

  /** Score -> label cut-offs on the -100..+100 scale. */
  thresholds: {
    strongBuy: number;
    buy: number;
    sell: number;
    strongSell: number;
  };

  /** Number of candles needed before a timeframe is considered available. */
  minCandles: number;
}

export const DEFAULT_COMPASS_CONFIG: CompassConfig = {
  // 0.05% is the tolerance the previous MA block already used in spirit; it is
  // now explicit and configurable. Gold, ES and YM all trade in ranges wide
  // enough that a sub-0.05% gap is genuinely noise.
  maTolerancePercent: 0.05,

  // Longer averages describe the dominant trend, so they carry more weight,
  // matching the emphasis placed on the 50/100/200 lines.
  maWeights: {
    'SMA 5': 0.5,
    'EMA 5': 0.5,
    'SMA 10': 0.6,
    'EMA 10': 0.6,
    'SMA 20': 0.8,
    'EMA 20': 0.8,
    'SMA 50': 1.0,
    'EMA 50': 1.0,
    'SMA 100': 1.2,
    'EMA 100': 1.2,
    'SMA 200': 1.5,
    'EMA 200': 1.5,
  },

  // Directional/trend indicators weigh more than pure volatility readings.
  // ATR is a context reading, so it is present but weighted very low.
  indicatorWeights: {
    'RSI (14)': 1.0,
    'Stochastic (9,6)': 1.0,
    'Stochastic RSI (14)': 0.8,
    'MACD (12,26,9)': 1.5,
    'ADX (14)': 1.2,
    'Williams %R (14)': 0.8,
    'CCI (14)': 1.0,
    'ATR (14)': 0.3,
    'Highs/Lows (14)': 0.6,
    'Ultimate Oscillator': 0.8,
    'ROC (12)': 0.8,
    'Bull/Bear Power (13)': 1.0,
  },

  // The summary is an even blend of the two blocks.
  gaugeBlend: {
    movingAverages: 1.0,
    indicators: 1.0,
  },

  // M1 is deliberately light: it is noisy and useful mainly for entry timing,
  // not for the trend read. M5 and M15 are medium; M30 and above carry the
  // trend and dominate the confluence bias.
  timeframeWeights: {
    '1m': 0.2,
    '5m': 0.6,
    '15m': 1.0,
    '30m': 1.2,
    '1h': 1.6,
    '4h': 1.8,
    '1D': 2.0,
  },

  entryCheck: {
    // 1H and above is "the trend" for an intraday entry.
    higherTimeframes: ['1h', '4h', '1D'],
    warnOnHigherTimeframeDisagreement: true,
    // A majority of the weighted directional vote, plus agreement from the
    // higher timeframes, is what earns ALIGNED.
    alignedShare: 0.6,
    againstShare: 0.4,
  },

  thresholds: {
    strongBuy: 60,
    buy: 20,
    sell: -20,
    strongSell: -60,
  },

  minCandles: 30,
};

/**
 * Shallow-merge override so a caller can change one field without restating
 * the whole config.
 */
export function mergeCompassConfig(
  base: CompassConfig = DEFAULT_COMPASS_CONFIG,
  override: Partial<CompassConfig> = {}
): CompassConfig {
  return {
    ...base,
    ...override,
    maWeights: { ...base.maWeights, ...(override.maWeights ?? {}) },
    indicatorWeights: { ...base.indicatorWeights, ...(override.indicatorWeights ?? {}) },
    gaugeBlend: { ...base.gaugeBlend, ...(override.gaugeBlend ?? {}) },
    timeframeWeights: { ...base.timeframeWeights, ...(override.timeframeWeights ?? {}) },
    entryCheck: { ...base.entryCheck, ...(override.entryCheck ?? {}) },
    thresholds: { ...base.thresholds, ...(override.thresholds ?? {}) },
  };
}
