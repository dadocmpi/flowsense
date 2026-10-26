// ============================================
// MULTI-TIMEFRAME COMPASS HOOK
// ============================================
// Runs the pure multi-timeframe engine over the feed's candle series.
//
// Recomputing every timeframe on every tick would be wasteful, so the engine
// runs when the base candle series changes (which the provider drives), not on
// every price tick. The live price is applied separately.

import { useMemo, useState } from 'react';
import { computeMultiTimeframeFromSeries, type MultiTimeframeReading } from '../core/multiTimeframe';
import type { Timeframe } from '../core/types';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import type { InstrumentFeed } from './useInstrumentFeed';

export interface UseMultiTimeframeCompassResult {
  reading: MultiTimeframeReading | null;
  selected: Timeframe;
  setSelected: (timeframe: Timeframe) => void;
}

export function useMultiTimeframeCompass(
  feed: InstrumentFeed,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG,
  initialTimeframe: Timeframe = '15m'
): UseMultiTimeframeCompassResult {
  const [selected, setSelected] = useState<Timeframe>(initialTimeframe);

  const reading = useMemo(
    () =>
      Object.keys(feed.seriesByTimeframe).length > 0
        ? computeMultiTimeframeFromSeries(feed.seriesByTimeframe, config, undefined, feed.price)
        : null,
    // feed.revision bumps whenever the provider updates the candle series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.seriesByTimeframe, feed.price, feed.revision, config]
  );

  return { reading, selected, setSelected };
}
