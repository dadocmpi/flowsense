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
// Order flow is fetched for the SELECTED timeframe only — one request at a time,
// never a sweep — and merged into that timeframe's reading. With the shipped
// `none` adapter there is no source, so the reading is null and the right-hand
// card says so.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe, TimeframeReading } from '../core/types';
import { TIMEFRAMES } from '../core/types';
import { computeTimeframeReading } from '../core/timeframeEngine';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import {
  activeOrderFlowProvider,
  clearOrderFlowCache,
  probeOrderFlowProvider,
  type OrderFlowProbeResult,
  type OrderFlowReading,
} from '../core/providers/orderflow';
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
  /** Whether an order-flow source is configured, and what it is. */
  orderFlow: OrderFlowProbeResult | null;
}

export function readingKey(instrumentId: string, timeframe: Timeframe): string {
  return `${instrumentId}:${timeframe}`;
}

/** Series identity -> the timestamp its reading was last computed at. */
type Stamp = { series: Candle[]; updatedAt: number };

export function useTimeframeReadings(
  feed: InstrumentFeed,
  selectedTimeframe: Timeframe,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): UseTimeframeReadingsResult {
  const stampsRef = useRef(new Map<string, Stamp>());
  const [orderFlowByKey, setOrderFlowByKey] = useState<Record<string, OrderFlowReading | null>>({});
  const [orderFlow, setOrderFlow] = useState<OrderFlowProbeResult | null>(null);

  // Ask the server whether an order-flow source exists. A server-side fact, so
  // it is asked once and cached; the route costs no vendor credits.
  useEffect(() => {
    let active = true;
    probeOrderFlowProvider()
      .then(result => {
        if (active) setOrderFlow(result);
      })
      .catch(() => {
        if (active) setOrderFlow(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch order flow for the selected timeframe only, when a source is
  // configured. A source that answers null leaves the card with no reading
  // rather than a placeholder.
  useEffect(() => {
    if (!orderFlow?.configured) return;
    const provider = activeOrderFlowProvider();
    if (!provider.isConfigured()) return;

    let active = true;
    const controller = new AbortController();
    provider
      .getReading({ instrument: feed.instrument, timeframe: selectedTimeframe, signal: controller.signal })
      .then(reading => {
        if (!active) return;
        setOrderFlowByKey(prev => ({ ...prev, [readingKey(feed.instrument.id, selectedTimeframe)]: reading }));
      })
      .catch(() => {
        // A silent source is reported as no reading, never as a guess.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [feed.instrument, selectedTimeframe, orderFlow?.configured, feed.revision]);

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

      map.set(key, {
        key,
        instrumentId: feed.instrument.id,
        timeframe,
        reading: computeTimeframeReading(timeframe, series, config, orderFlowByKey[key] ?? null),
        updatedAt,
      });
    }

    return map;
    // feed.seriesByTimeframe carries a new identity whenever a timeframe's series
    // actually changes, so it is the only series signal the recompute needs.
  }, [feed.seriesByTimeframe, feed.instrument.id, config, orderFlowByKey]);

  const current = byKey.get(readingKey(feed.instrument.id, selectedTimeframe)) ?? null;

  const stored = useMemo(
    () => TIMEFRAMES.map(tf => byKey.get(readingKey(feed.instrument.id, tf))).filter((entry): entry is StoredReading => Boolean(entry)),
    [byKey, feed.instrument.id]
  );

  return { current, stored, orderFlow };
}

/** Test seam: forget the order-flow probe result. */
export function resetOrderFlow(): void {
  clearOrderFlowCache();
}
