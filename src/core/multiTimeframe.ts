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
  timeframes: Timeframe[] = TIMEFRAMES,
  sessionMode: 'SESSION' | 'CONTINUOUS' = 'SESSION'
): MultiTimeframeReading {
  const readings = timeframes.map(timeframe =>
    computeTimeframeReading(timeframe, resampleCandles(baseCandles, timeframe, baseMinutes), config, sessionMode)
  );

  return {
    timeframes: readings,
    confluence: computeConfluence(
      readings.map(r => ({ timeframe: r.timeframe, score: r.summary.score, available: r.available })),
      config
    ),
    price: baseCandles.length > 0 ? baseCandles[baseCandles.length - 1].close : 0,
    baseCandleCount: baseCandles.length,
  };
}

/**
 * The preferred entry point when the provider can serve each timeframe
 * natively.
 *
 * Aggregating everything from one short base series caps how far back the
 * higher timeframes can reach — 1000 five-minute bars is about three days, so
 * the weekly can never fill. Fetching each interval natively also gives the
 * daily and weekly bars the exchange's own day/week boundaries instead of a
 * bucket inferred from an arbitrary base interval.
 *
 * A timeframe missing from the map is reported as unavailable rather than
 * back-filled from another series.
 */
export function computeMultiTimeframeFromSeries(
  seriesByTimeframe: Partial<Record<Timeframe, Candle[]>>,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG,
  timeframes: Timeframe[] = TIMEFRAMES,
  fallbackPrice = 0,
  sessionMode: 'SESSION' | 'CONTINUOUS' = 'SESSION'
): MultiTimeframeReading {
  const readings = timeframes.map(timeframe =>
    computeTimeframeReading(timeframe, seriesByTimeframe[timeframe] ?? [], config, sessionMode)
  );

  const finest = timeframes.find(tf => (seriesByTimeframe[tf]?.length ?? 0) > 0);
  const price =
    finest && seriesByTimeframe[finest]!.length > 0
      ? seriesByTimeframe[finest]![seriesByTimeframe[finest]!.length - 1].close
      : fallbackPrice;

  return {
    timeframes: readings,
    confluence: computeConfluence(
      readings.map(r => ({ timeframe: r.timeframe, score: r.summary.score, available: r.available })),
      config
    ),
    price,
    baseCandleCount: readings.reduce((acc, r) => acc + r.candleCount, 0),
  };
}

export { TIMEFRAMES, TIMEFRAME_MINUTES };
