// ============================================
// SIGNAL HISTORY
// ============================================
// History of published compass readings, keyed by instrument AND timeframe.
//
// Two bugs used to live here and are fixed by construction:
//
//  1. A positive score could carry a "Sell" label. The old store kept an
//     unsigned 0-100 score alongside a label produced by a different path, so
//     the two could drift. Here the label is not stored at all: it is derived
//     from the score through `labelFromScore`, the same function the gauge
//     uses. A stored entry therefore cannot disagree with itself, and
//     `normalizeEntry` re-derives the label on read to heal old records.
//
//  2. Entries appeared out of chronological order (14:50 before 16:29) and
//     across instruments. The old store used one global localStorage key, so
//     every instrument's publishes interleaved, and it appended without
//     sorting. Here history is partitioned by instrument + timeframe, and the
//     list is always kept sorted newest-first with a total order that breaks
//     timestamp ties by sequence number.

import type { ScoreLabel } from './types';
import { labelFromScore } from './scoring';
import { DEFAULT_COMPASS_CONFIG, type CompassConfig } from '../config/compass';

export interface SignalHistoryEntry {
  /** Monotonic sequence, unique per store. Breaks timestamp ties. */
  seq: number;
  /** Epoch ms of the reading. */
  timestamp: number;
  /** Local calendar date, `YYYY-MM-DD`, so a row is never ambiguous. */
  date: string;
  /** Local wall clock, `HH:MM`, for display. */
  time: string;
  instrumentId: string;
  timeframe: string;
  /** Signed score, -100..+100. */
  score: number;
  label: ScoreLabel;
  price: number;
  /** Data source id that produced the reading. */
  source: string;
}

export interface HistoryKey {
  instrumentId: string;
  timeframe: string;
}

/** Local calendar date in `YYYY-MM-DD`. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local wall clock in `HH:MM`. */
export function localTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface NewHistoryEntry {
  timestamp: number;
  instrumentId: string;
  timeframe: string;
  score: number;
  price: number;
  source: string;
}

/** Build a fully consistent entry from a raw reading. */
export function makeHistoryEntry(
  input: NewHistoryEntry,
  seq: number,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): SignalHistoryEntry {
  const timestamp = Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
  return {
    seq,
    timestamp,
    date: localDate(timestamp),
    time: localTime(timestamp),
    instrumentId: input.instrumentId,
    timeframe: input.timeframe,
    score: input.score,
    label: labelFromScore(input.score, config),
    price: input.price,
    source: input.source,
  };
}

/**
 * Repair an entry read from storage: re-derive the label from the score so a
 * record written by the old, inconsistent code cannot keep showing a "Sell"
 * label on a positive score.
 */
export function normalizeEntry(
  raw: Partial<SignalHistoryEntry>,
  config: CompassConfig = DEFAULT_COMPASS_CONFIG
): SignalHistoryEntry | null {
  if (!raw || typeof raw.score !== 'number' || !Number.isFinite(raw.score)) return null;
  if (typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp)) return null;

  return {
    seq: typeof raw.seq === 'number' && Number.isFinite(raw.seq) ? raw.seq : 0,
    timestamp: raw.timestamp,
    date: raw.date ?? localDate(raw.timestamp),
    time: raw.time ?? localTime(raw.timestamp),
    instrumentId: raw.instrumentId ?? 'unknown',
    timeframe: raw.timeframe ?? '5m',
    score: raw.score,
    label: labelFromScore(raw.score, config),
    price: typeof raw.price === 'number' ? raw.price : 0,
    source: raw.source ?? 'unknown',
  };
}

/**
 * Total order, newest first. Timestamp decides; a tie is broken by sequence so
 * two readings in the same minute never swap places between renders.
 */
export function compareNewestFirst(a: SignalHistoryEntry, b: SignalHistoryEntry): number {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
  return b.seq - a.seq;
}

export function sortHistory(entries: SignalHistoryEntry[]): SignalHistoryEntry[] {
  return [...entries].sort(compareNewestFirst);
}

export function entriesForKey(
  entries: SignalHistoryEntry[],
  key: HistoryKey,
  limit = 50
): SignalHistoryEntry[] {
  return sortHistory(
    entries.filter(e => e.instrumentId === key.instrumentId && e.timeframe === key.timeframe)
  ).slice(0, limit);
}

export interface AppendOptions {
  config?: CompassConfig;
  maxEntries?: number;
  /** Two readings closer than this are treated as the same publish. */
  dedupeWindowMs?: number;
}

/**
 * Append a reading to the store.
 *
 * - entries are partitioned by instrument + timeframe
 * - a reading within `dedupeWindowMs` of the newest entry for the SAME
 *   instrument+timeframe is treated as a duplicate and ignored, so a reconnect
 *   or a tab resume cannot publish the same bar twice
 * - the result is always sorted newest-first
 */
export function appendHistory(
  entries: SignalHistoryEntry[],
  reading: NewHistoryEntry,
  options: AppendOptions = {}
): { entries: SignalHistoryEntry[]; appended: SignalHistoryEntry | null } {
  const config = options.config ?? DEFAULT_COMPASS_CONFIG;
  const maxEntries = options.maxEntries ?? 200;
  const dedupeWindowMs = options.dedupeWindowMs ?? 5_000;

  const nextSeq = entries.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
  const candidate = makeHistoryEntry(reading, nextSeq, config);

  const sameSeries = entriesForKey(entries, {
    instrumentId: candidate.instrumentId,
    timeframe: candidate.timeframe,
  }, 1);

  const newest = sameSeries[0];
  if (newest && Math.abs(newest.timestamp - candidate.timestamp) < dedupeWindowMs) {
    return { entries, appended: null };
  }

  const merged = sortHistory([...entries, candidate]);
  // Keep the newest `maxEntries`, but never drop another series' rows just
  // because this one is busy.
  const perSeries = new Map<string, number>();
  const trimmed = merged.filter(entry => {
    const key = `${entry.instrumentId}|${entry.timeframe}`;
    const count = perSeries.get(key) ?? 0;
    perSeries.set(key, count + 1);
    return count < maxEntries;
  });

  return { entries: trimmed, appended: candidate };
}

/** Group a flat store into per-series buckets, newest-first inside each. */
export function groupHistory(
  entries: SignalHistoryEntry[],
  limit = 20
): Map<string, SignalHistoryEntry[]> {
  const grouped = new Map<string, SignalHistoryEntry[]>();
  for (const entry of sortHistory(entries)) {
    const key = `${entry.instrumentId}|${entry.timeframe}`;
    const bucket = grouped.get(key) ?? [];
    if (bucket.length < limit) bucket.push(entry);
    grouped.set(key, bucket);
  }
  return grouped;
}
