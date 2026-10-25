// ============================================
// MULTI-TIMEFRAME ENGINE
// ============================================
// Turns one base candle series into a reading for every timeframe, plus the
// confluence summary. Pure and synchronous, so it can be unit tested and can
// also be memoised cheaply in the UI.

import type { Candle, Timeframe, TimeframeReading } from './types';
import { TIMEFRAMES, TIMEFRAME_MINUTES } from './types';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import { resampleCandles } from './candles';
import { computeTimeframeReading } from './timeframeEngine';
import { computeConfluence, type ConfluenceResult } from './scoring';

export interface MultiTimeframeReading {
  timeframes: TimeframeReading[];
  confluence: ConfluenceResult;
  /** Price the reading was taken at (last close of the base series). */
  price: number;
  baseCandleCount: number;
}

export function computeMultiTimeframe(
  baseCandles: Candle[],
  baseMinutes: number,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG,
  timeframes: Timeframe[] = TIMEFRAMES
): MultiTimeframeReading {
  const readings = timeframes.map(timeframe =>
    computeTimeframeReading(timeframe, resampleCandles(baseCandles, timeframe, baseMinutes), config)
  );

  const confluence = computeConfluence(
    readings.map(r => ({ timeframe: r.timeframe, score: r.summary.score, available: r.available })),
    config
  );

  return {
    timeframes: readings,
    confluence,
    price: baseCandles.length > 0 ? baseCandles[baseCandles.length - 1].close : 0,
    baseCandleCount: baseCandles.length,
  };
}

export { TIMEFRAMES, TIMEFRAME_MINUTES };
