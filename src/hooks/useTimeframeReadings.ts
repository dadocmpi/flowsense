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
// Order flow comes from the live venue feed (one connection, shared through the
// order-flow store). It is derived per timeframe from CLOSED candle buckets, so
// the Compass never reads a live-ticking value, and the same reading is what the
// Order Flow panel shows. With no feed the reading is null and the card says so.

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Candle, Timeframe, TimeframeReading } from '../core/types';
import { TIMEFRAMES } from '../core/types';
import { computeTimeframeReading } from '../core/timeframeEngine';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import { TIMEFRAME_MINUTES } from '../core/types';
import type { OrderFlowReading } from '../core/types';
import { utcResetBoundary, bookImbalance } from '../core/orderflow/aggregate';
import { buildLiveOrderFlowReading } from '../core/orderflow/reading';
import {
  ensureOrderFlowStarted,
  getOrderFlowVersion,
  readOrderFlowState,
  subscribeOrderFlowStore,
} from './orderFlowStore';
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
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): UseTimeframeReadingsResult {
  const stampsRef = useRef(new Map<string, Stamp>());

  // The live venue feed. This hook owns no socket: it reads the shared store, so
  // the panel and the Compass see the very same connection.
  useEffect(() => {
    ensureOrderFlowStarted();
  }, []);
  const flowVersion = useSyncExternalStore(subscribeOrderFlowStore, getOrderFlowVersion, getOrderFlowVersion);

  // One reading per timeframe, built from the closed-candle delta buckets. The
  // imbalance is the live book read once; it is the only live input, and it is
  // the resting book, not a ticking trade.
  const orderFlowByKey = useMemo(() => {
    const state = readOrderFlowState();
    const imbalance = state.book
      ? bookImbalance(state.book.bids, state.book.asks, config.orderFlow.imbalanceLevels)
      : null;
    const resetAt = state.aggregator.resetAt ?? utcResetBoundary(state.health.lastMessageAt ?? Date.now());

    const out: Record<string, OrderFlowReading | null> = {};
    for (const timeframe of TIMEFRAMES) {
      const result = buildLiveOrderFlowReading({
        minutes: state.aggregator.minuteBuckets(),
        timeframeMinutes: TIMEFRAME_MINUTES[timeframe],
        resetAt,
        imbalance,
        venue: state.health.venue,
        config,
      });
      out[readingKey(feed.instrument.id, timeframe)] = result
        ? {
            gauge: result.gauge,
            metrics: result.metrics,
            detail: {
              venue: state.health.venue,
              resetAt: state.aggregator.resetAt,
              state: result.state,
              smoothedImbalance: result.smoothedImbalance,
              cvdSeries: result.cvdSeries,
              candleCount: result.candleCount,
              imbalanceLevels: config.orderFlow.imbalanceLevels,
            },
            source: state.health.venue,
          }
        : null;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowVersion, feed.instrument.id, config]);

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

  return { current, stored };
}
