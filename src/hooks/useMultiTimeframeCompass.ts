// ============================================
// MULTI-TIMEFRAME COMPASS HOOK
// ============================================
// Runs the pure multi-timeframe engine over the feed's candle series and
// publishes a reading to the history store on a fixed cadence.
//
// Recomputing every timeframe on every tick would be wasteful, so the engine
// runs when the base candle series changes (which the provider drives), not on
// every price tick. The live price is applied separately.

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeMultiTimeframeFromSeries, type MultiTimeframeReading } from '../core/multiTimeframe';
import type { Timeframe } from '../core/types';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';
import type { InstrumentFeed } from './useInstrumentFeed';
import { appendHistory, sortHistory, type SignalHistoryEntry } from '../core/history';

/** How often a reading is published to the history store. */
const PUBLISH_INTERVAL_MS = 60_000;

export interface UseMultiTimeframeCompassResult {
  reading: MultiTimeframeReading | null;
  selected: Timeframe;
  setSelected: (timeframe: Timeframe) => void;
  history: SignalHistoryEntry[];
}

const HISTORY_KEY = 'flowsense_history_v2';

function loadStoredHistory(): SignalHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // normalizeEntry is applied on read, so records written by the old code
    // (which could carry a label inconsistent with the score) are healed here.
    return sortHistory(
      parsed
        .map(entry => normalizeStored(entry as Partial<SignalHistoryEntry>))
        .filter((entry): entry is SignalHistoryEntry => entry !== null)
    );
  } catch {
    return [];
  }
}

function normalizeStored(raw: Partial<SignalHistoryEntry>): SignalHistoryEntry | null {
  if (typeof raw?.score !== 'number' || !Number.isFinite(raw.score)) return null;
  if (typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp)) return null;
  return {
    seq: typeof raw.seq === 'number' ? raw.seq : 0,
    timestamp: raw.timestamp,
    date: raw.date ?? '',
    time: raw.time ?? '',
    instrumentId: raw.instrumentId ?? 'unknown',
    timeframe: raw.timeframe ?? '5m',
    score: raw.score,
    label: raw.label ?? 'NEUTRAL',
    price: typeof raw.price === 'number' ? raw.price : 0,
    source: raw.source ?? 'unknown',
  };
}

export function useMultiTimeframeCompass(
  feed: InstrumentFeed,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): UseMultiTimeframeCompassResult {
  const [selected, setSelected] = useState<Timeframe>('15m');
  const [history, setHistory] = useState<SignalHistoryEntry[]>(() => loadStoredHistory());

  const historyRef = useRef<SignalHistoryEntry[]>(history);
  // Which series was published last, and when. Keying on the series (rather
  // than using a 0 sentinel) is what stops an instrument switch from
  // publishing twice: the switch publishes once, and the series that arrives
  // afterwards is recognised as the same series and rate-limited.
  const lastPublishRef = useRef<{ key: string; at: number } | null>(null);

  const reading = useMemo(
    () =>
      Object.keys(feed.seriesByTimeframe).length > 0
        ? computeMultiTimeframeFromSeries(
            feed.seriesByTimeframe,
            config,
            undefined,
            feed.price,
            feed.instrument.sessionMode
          )
        : null,
    // feed.revision bumps whenever the provider updates the candle series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.seriesByTimeframe, feed.price, feed.revision, config, feed.instrument.sessionMode]
  );

  // Publish the selected timeframe's reading on a fixed cadence, and always
  // once when a new instrument/timeframe becomes available.
  useEffect(() => {
    if (!reading) return;

    const frame = reading.timeframes.find(t => t.timeframe === selected);
    if (!frame || !frame.available) return;

    const seriesKey = `${feed.instrument.id}|${selected}`;
    const now = Date.now();
    const previous = lastPublishRef.current;
    if (previous && previous.key === seriesKey && now - previous.at < PUBLISH_INTERVAL_MS) return;
    lastPublishRef.current = { key: seriesKey, at: now };

    const result = appendHistory(
      historyRef.current,
      {
        timestamp: now,
        instrumentId: feed.instrument.id,
        timeframe: selected,
        score: frame.summary.score,
        price: frame.price,
        source: feed.sourceLabel,
      },
      { config }
    );

    if (result.appended) {
      historyRef.current = result.entries;
      setHistory(result.entries);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(result.entries));
      } catch {
        /* storage full or unavailable; history stays in memory */
      }
    }
    // A timeframe or instrument switch publishes immediately: the series key
    // changes, so the interval guard above does not apply to it.
  }, [reading, selected, feed.instrument.id, feed.sourceLabel, config]);

  return { reading, selected, setSelected, history };
}
