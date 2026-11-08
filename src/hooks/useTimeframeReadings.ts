// ============================================
// PER-TIMEFRAME READING STORE
// ============================================
// One reading per (asset, timeframe), kept apart on purpose: switching M15 -> 1H
// -> M15 must never blend the two series, and a chip for a timeframe loaded
// earlier must still show THAT timeframe's reading and how old it is.
//
// The key is `asset:timeframe`. The store is module-level so it survives a
// component remount and so switching back to a timeframe already loaded costs
// nothing and needs no vendor call.
//
// Order flow is a SEPARATE provider (see useOrderFlow): this hook receives the
// selected timeframe's real reading and blends it into THAT timeframe only. It
// never derives order flow from candles.

import { useMemo, useRef } from 'react';
import type { Candle, Timeframe, TimeframeReading } from '../core/types';
import { TIMEFRAMES } from '../core/types';
import { computeTimeframeReading } from '../core/timeframeEngine';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import type { OrderFlowReading } from '../core/providers/orderflow';
import type { InstrumentFeed } from './useInstrumentFeed';

export interface StoredReading {
  /** `asset:timeframe`. */
  key: string;
  instrumentId: string;
  timeframe: Timeframe;
  reading: TimeframeReading;
  /** Epoch ms this reading was last computed from a fresh series. */
  updatedAt: number;
}

export interface UseTimeframeReadingsResult {
  /** The reading for the selected timeframe, or null while it is not loaded. */
  current: StoredReading | null;
  /** Every stored reading for the current asset, in timeframe order. */
  stored: StoredReading[];
}

export function readingKey(instrumentId: string, timeframe: Timeframe): string {
  return `${instrumentId}:${timeframe}`;
}

/** Series identity -> the timestamp its reading was last computed at. */
type Stamp = { series: Candle[]; updatedAt: number };

export function useTimeframeReadings(
  feed: InstrumentFeed,
  selectedTimeframe: Timeframe,
  orderFlowReading: OrderFlowReading | null = null,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): UseTimeframeReadingsResult {
  const stampsRef = useRef(new Map<string, Stamp>());

  const byKey = useMemo(() => {
    const map = new Map<string, StoredReading>();
    const stamps = stampsRef.current;

    for (const timeframe of TIMEFRAMES) {
      const series = feed.seriesByTimeframe[timeframe];
      if (!series) continue;

      const key = readingKey(feed.instrument.id, timeframe);
      const previous = stamps.get(key);
      // A new series identity means the reading genuinely changed, so the age
      // resets. An unchanged series keeps its original timestamp, which is what
      // makes "2 min ago" mean something.
      const updatedAt = previous && previous.series === series ? previous.updatedAt : Date.now();
      stamps.set(key, { series, updatedAt });

      // Order flow is blended into the SELECTED timeframe only: it is read for
      // one (instrument, timeframe) at a time, never swept across all of them.
      const orderFlow = timeframe === selectedTimeframe ? orderFlowReading : null;

      map.set(key, {
        key,
        instrumentId: feed.instrument.id,
        timeframe,
        reading: computeTimeframeReading(timeframe, series, config, orderFlow),
        updatedAt,
      });
    }

    return map;
    // feed.seriesByTimeframe carries a new identity whenever a timeframe's series
    // actually changes, so it is the only series signal the recompute needs.
  }, [feed.seriesByTimeframe, feed.instrument.id, config, orderFlowReading, selectedTimeframe]);

  const current = byKey.get(readingKey(feed.instrument.id, selectedTimeframe)) ?? null;

  const stored = useMemo(
    () =>
      TIMEFRAMES.map(tf => byKey.get(readingKey(feed.instrument.id, tf))).filter(
        (entry): entry is StoredReading => Boolean(entry)
      ),
    [byKey, feed.instrument.id]
  );

  return { current, stored };
}
