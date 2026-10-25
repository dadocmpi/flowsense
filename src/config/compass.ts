// ============================================
// COMPASS CONFIGURATION
// ============================================
// One file holds every tunable that shapes the compass: the vote thresholds,
// the moving-average tolerance band, the per-indicator weights, the per
// timeframe weights and the session definitions used for VWAP / POC.
//
// The scoring code reads this object; nothing is hardcoded downstream.

import type { Timeframe } from '../core/types';

export interface SessionConfig {
  /**
   * `RTH`  — regular trading hours only (the futures pit session, 09:30-16:00 ET).
   * `FULL` — the whole exchange session, reset at the futures day open
   *          (18:00 ET the previous calendar day for CME equity/index
   *          products, and for metals too).
   *
   * The reset boundary is what matters: VWAP and POC are measured from the
   * start of the current session, never from a rolling window.
   */
  mode: 'RTH' | 'FULL';
  /** IANA timezone the session clock is expressed in. */
  timezone: string;
  /** RTH open / close, minutes from midnight in `timezone`. */
  rthOpenMinutes: number;
  rthCloseMinutes: number;
  /** FULL-session open, minutes from midnight in `timezone` (18:00 = 1080). */
  fullOpenMinutes: number;
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

  /** Score -> label cut-offs on the -100..+100 scale. */
  thresholds: {
    strongBuy: number;
    buy: number;
    sell: number;
    strongSell: number;
  };

  /** Number of candles needed before a timeframe is considered available. */
  minCandles: number;

  /** Session definition used by VWAP and the volume point of control. */
  session: SessionConfig;
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

  // Higher timeframes dominate the confluence bias, but the intraday swings
  // still matter: 15m, 1h, 4h and 1D carry the most weight.
  timeframeWeights: {
    '5m': 0.4,
    '15m': 1.0,
    '30m': 0.8,
    '1h': 1.2,
    '4h': 1.4,
    '1D': 1.4,
    '1W': 0.6,
  },

  thresholds: {
    strongBuy: 60,
    buy: 20,
    sell: -20,
    strongSell: -60,
  },

  minCandles: 30,

  session: {
    mode: 'RTH',
    timezone: 'America/New_York',
    rthOpenMinutes: 9 * 60 + 30, // 09:30
    rthCloseMinutes: 16 * 60, // 16:00
    fullOpenMinutes: 18 * 60, // 18:00 previous day
  },
};

/**
 * Shallow-merge override so a caller can change one field (for example the
 * session mode) without restating the whole config.
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
    thresholds: { ...base.thresholds, ...(override.thresholds ?? {}) },
    session: { ...base.session, ...(override.session ?? {}) },
  };
}
