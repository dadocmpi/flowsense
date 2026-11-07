// ============================================
// COMPASS CONFIGURATION
// ============================================
// One file holds every tunable that shapes the compass: the vote thresholds,
// the moving-average tolerance band, the per-indicator weights, the per
// timeframe weights and the session definitions used for VWAP / POC.
//
// The scoring code reads this object; nothing is hardcoded downstream.


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

export interface EntryCheckConfig {
  /**
   * Weight each compass carries when judging whether the market agrees with the
   * chosen direction. The summary is the blended overall read, so it carries
   * more than its two inputs. A compass with no reading is excluded, not
   * weighted as neutral.
   */
  compassWeights: {
    technical: number;
    summary: number;
    orderFlow: number;
  };
  /**
   * Share of the weighted directional vote that must agree before the verdict
   * can be ALIGNED. Measured only across compasses that actually took a side, so
   * a neutral compass neither helps nor hurts.
   */
  alignedShare: number;
  /** Below this share the verdict is AGAINST rather than MIXED. */
  againstShare: number;
}

export interface CompassConfig {
  /**
   * Tolerance band, as a percentage of price, inside which a price-vs-level
   * comparison is Neutral rather than Buy/Sell. Used by the moving averages.
   */
  maTolerancePercent: number;

  /** Weight each moving average carries inside the MA block. */
  maWeights: Record<string, number>;

  /** Weight each oscillator carries inside the oscillator block. */
  indicatorWeights: Record<string, number>;

  /**
   * Blend between the two blocks that make up the LEFT "Technical indicators"
   * gauge. These are normalised, so only the ratio matters.
   */
  technicalBlend: {
    movingAverages: number;
    indicators: number;
  };

  /**
   * Blend between the technical gauge and the order-book gauge when forming the
   * CENTER "Summary" gauge. Ignored when no order-book source is configured,
   * because the summary is then the technical reading itself.
   */
  orderFlowBlend: {
    technical: number;
    orderFlow: number;
  };

  /** Rules behind the order-book pressure reading. */
  orderBook: {
    /**
     * Book imbalance (bid share minus ask share, -1..+1) inside which the book
     * is Neutral rather than Buy/Sell. Below this the resting sizes are close
     * enough to balanced that calling a side would be noise.
     */
    neutralBand: number;
  };

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

  /**
   * Candles requested per timeframe load. At least 250 so EMA 200 is valid;
   * one request per timeframe, so a bigger window costs the same credit.
   */
  requestedCandles: number;

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

  // The technical gauge is an even blend of the two blocks.
  technicalBlend: {
    movingAverages: 1.0,
    indicators: 1.0,
  },

  // An even blend of the technical read and order book, when a book exists.
  orderFlowBlend: {
    technical: 1.0,
    orderFlow: 1.0,
  },

  // A resting book within +/-5% of balanced is Neutral: the two sides are close
  // enough that naming a side would be reading noise, not pressure.
  orderBook: {
    neutralBand: 0.05,
  },

  entryCheck: {
    // The summary already blends the technical read and order flow, so it is
    // the strongest single signal and carries the most weight.
    compassWeights: {
      technical: 1.0,
      summary: 1.4,
      orderFlow: 1.0,
    },
    // A weighted majority of the compasses is what earns ALIGNED.
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

  // EMA 200 needs 200 closes; 300 leaves room for the other warmups.
  requestedCandles: 300,

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
    technicalBlend: { ...base.technicalBlend, ...(override.technicalBlend ?? {}) },
    orderFlowBlend: { ...base.orderFlowBlend, ...(override.orderFlowBlend ?? {}) },
    orderBook: { ...base.orderBook, ...(override.orderBook ?? {}) },
    entryCheck: { ...base.entryCheck, ...(override.entryCheck ?? {}) },
    thresholds: { ...base.thresholds, ...(override.thresholds ?? {}) },
    session: { ...base.session, ...(override.session ?? {}) },
  };
}
