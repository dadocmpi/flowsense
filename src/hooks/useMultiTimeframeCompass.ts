// ============================================
// MULTI-TIMEFRAME COMPASS HOOK
// ============================================
// Runs the pure multi-timeframe engine over the feed's candle series.
//
// Recomputing every timeframe on every tick would be wasteful, so the engine
// runs when the base candle series changes (which the provider drives), not on
// every price tick. The live price is applied separately.

import { useMemo } from 'react';
import { computeMultiTimeframeFromSeries, type MultiTimeframeReading } from '../core/multiTimeframe';

import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import type { InstrumentFeed } from './useInstrumentFeed';

export interface UseMultiTimeframeCompassResult {
  reading: MultiTimeframeReading | null;
}

/**
 * Runs the pure multi-timeframe engine over whatever the feed has loaded.
 *
 * The engine reads every timeframe present in `seriesByTimeframe`; a timeframe
 * the user has not opened yet is simply absent and reported as unavailable,
 * rather than triggering a fetch. Loading timeframes is the feed's job, driven by
 * the selected timeframe, which is what keeps the credit spend at one fetch per
 * timeframe the user actually looks at.
 */
export function useMultiTimeframeCompass(
  feed: InstrumentFeed,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): UseMultiTimeframeCompassResult {
  const reading = useMemo(
    () =>
      Object.keys(feed.seriesByTimeframe).length > 0
        ? computeMultiTimeframeFromSeries(feed.seriesByTimeframe, config, undefined, feed.price)
        : null,
    // feed.revision bumps whenever the provider updates the candle series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.seriesByTimeframe, feed.price, feed.revision, config]
  );

  return { reading };
}
