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
import { buildOrderBookReading } from '../core/orderbook';
import { ORDER_BOOK_POLL_INTERVAL_MS } from '../core/providers/polling';
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
  /** Whether an order-book source is configured, and what it is. */
  orderFlow: OrderFlowProbeResult | null;
  /**
   * The resting book snapshot, re-read on its own real-time cadence. It is the
   * same book for every timeframe — a book has no timeframe — so it is kept
   * once, apart from the per-timeframe readings.
   */
  book: OrderFlowReading | null;
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
  const [orderFlow, setOrderFlow] = useState<OrderFlowProbeResult | null>(null);
  const [book, setBook] = useState<OrderFlowReading | null>(null);

  // Ask the server whether an order-book source exists. A server-side fact, so
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

  // Read the resting book on its own real-time cadence, for the selected
  // instrument. A book has no timeframe, so this is fetched once and shared by
  // every timeframe's reading. A source that answers null leaves the card with
  // no reading rather than a placeholder, and a silent poll keeps the last real
  // book rather than blanking it.
  useEffect(() => {
    if (!orderFlow?.configured) {
      setBook(null);
      return;
    }
    const provider = activeOrderFlowProvider();
    if (!provider.isConfigured()) {
      setBook(null);
      return;
    }

    let active = true;
    let controller = new AbortController();

    const read = () => {
      controller.abort();
      controller = new AbortController();
      provider
        .getReading({ instrument: feed.instrument, timeframe: selectedTimeframe, signal: controller.signal })
        .then(quote => {
          if (!active) return;
          setBook(quote ? buildOrderBookReading(quote, config) : null);
        })
        .catch(() => {
          // A silent poll is not a reason to wipe the last real book; the next
          // poll will refresh it. Nothing is invented in the meantime.
        });
    };

    read();
    const timer = window.setInterval(read, ORDER_BOOK_POLL_INTERVAL_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [feed.instrument, selectedTimeframe, orderFlow?.configured, config]);

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
        reading: computeTimeframeReading(timeframe, series, config, book),
        updatedAt,
      });
    }

    return map;
    // feed.seriesByTimeframe carries a new identity whenever a timeframe's series
    // actually changes, so it is the only series signal the recompute needs. The
    // book is timeframe-independent, so one change re-blends every reading.
  }, [feed.seriesByTimeframe, feed.instrument.id, config, book]);

  const current = byKey.get(readingKey(feed.instrument.id, selectedTimeframe)) ?? null;

  const stored = useMemo(
    () => TIMEFRAMES.map(tf => byKey.get(readingKey(feed.instrument.id, tf))).filter((entry): entry is StoredReading => Boolean(entry)),
    [byKey, feed.instrument.id]
  );

  return { current, stored, orderFlow, book };
}

/** Test seam: forget the order-flow probe result. */
export function resetOrderFlow(): void {
  clearOrderFlowCache();
}
