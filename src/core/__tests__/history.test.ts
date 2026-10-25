// ============================================
// SIGNAL HISTORY TESTS
// ============================================
// These tests lock in the two fixes for the reported history bugs:
//
//  1. label / score sign consistency
//  2. chronological ordering, with the date present and series not mixed

import { describe, expect, it } from 'vitest';
import {
  appendHistory,
  entriesForKey,
  groupHistory,
  localDate,
  localTime,
  makeHistoryEntry,
  normalizeEntry,
  sortHistory,
  type SignalHistoryEntry,
} from '../history';
import { labelFromScore } from '../scoring';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass';

const BASE = Date.UTC(2024, 4, 15, 12, 0, 0); // 2024-05-15 12:00 UTC

function reading(overrides: Partial<Parameters<typeof makeHistoryEntry>[0]> = {}) {
  return {
    timestamp: BASE,
    instrumentId: 'GC',
    timeframe: '15m',
    score: 30,
    price: 2400,
    source: 'twelvedata',
    ...overrides,
  };
}

describe('localDate / localTime', () => {
  it('produces a full calendar date and a wall clock', () => {
    const ms = new Date(2024, 4, 15, 14, 50, 0).getTime();
    expect(localDate(ms)).toBe('2024-05-15');
    expect(localTime(ms)).toBe('14:50');
  });

  it('zero-pads month, day, hour and minute', () => {
    const ms = new Date(2024, 0, 5, 9, 7, 0).getTime();
    expect(localDate(ms)).toBe('2024-01-05');
    expect(localTime(ms)).toBe('09:07');
  });
});

describe('makeHistoryEntry', () => {
  it('derives the label from the score, never from a separate input', () => {
    const entry = makeHistoryEntry(reading({ score: 30 }), 1);
    expect(entry.score).toBe(30);
    expect(entry.label).toBe(labelFromScore(30, DEFAULT_COMPASS_CONFIG));
    expect(entry.label).toBe('BUY');
  });

  it('stores the date alongside the time so a row is unambiguous', () => {
    const entry = makeHistoryEntry(reading({ timestamp: new Date(2024, 4, 15, 16, 29).getTime() }), 1);
    expect(entry.date).toBe('2024-05-15');
    expect(entry.time).toBe('16:29');
  });

  it('REGRESSION: a positive score never carries a bearish label', () => {
    // 30, 33, 25 and 20 were the scores reported as "Sell" / "Strong sell".
    for (const score of [30, 33, 25, 20]) {
      const entry = makeHistoryEntry(reading({ score }), 1);
      expect(entry.label).not.toBe('SELL');
      expect(entry.label).not.toBe('STRONG_SELL');
    }
  });

  it('falls back to now for a non-finite timestamp', () => {
    const entry = makeHistoryEntry(reading({ timestamp: NaN }), 1);
    expect(Number.isFinite(entry.timestamp)).toBe(true);
  });
});

describe('normalizeEntry', () => {
  it('re-derives the label, healing an inconsistent stored record', () => {
    // A record written by the old code: positive score, "Sell" label.
    const stored = {
      seq: 1,
      timestamp: BASE,
      instrumentId: 'GC',
      timeframe: '15m',
      score: 30,
      label: 'SELL' as const,
      price: 2400,
      source: 'twelvedata',
    };
    const healed = normalizeEntry(stored);
    expect(healed).not.toBeNull();
    expect(healed!.label).toBe('BUY');
  });

  it('rejects records without a usable score or timestamp', () => {
    expect(normalizeEntry({ score: NaN, timestamp: BASE })).toBeNull();
    expect(normalizeEntry({ score: 30, timestamp: NaN })).toBeNull();
    expect(normalizeEntry({})).toBeNull();
  });

  it('fills in a missing date and time from the timestamp', () => {
    const healed = normalizeEntry({ score: 10, timestamp: new Date(2024, 4, 15, 16, 29).getTime() });
    expect(healed!.date).toBe('2024-05-15');
    expect(healed!.time).toBe('16:29');
  });
});

describe('sortHistory', () => {
  it('orders newest first', () => {
    const entries = [
      makeHistoryEntry(reading({ timestamp: BASE }), 1),
      makeHistoryEntry(reading({ timestamp: BASE + 3_600_000 }), 2),
      makeHistoryEntry(reading({ timestamp: BASE - 3_600_000 }), 3),
    ];
    const sorted = sortHistory(entries);
    expect(sorted.map(e => e.timestamp)).toEqual([BASE + 3_600_000, BASE, BASE - 3_600_000]);
  });

  it('REGRESSION: 16:29 sorts above 14:50, not below it', () => {
    const early = makeHistoryEntry(reading({ timestamp: new Date(2024, 4, 15, 14, 50).getTime() }), 1);
    const late = makeHistoryEntry(reading({ timestamp: new Date(2024, 4, 15, 16, 29).getTime() }), 2);
    const sorted = sortHistory([early, late]);
    expect(sorted[0].time).toBe('16:29');
    expect(sorted[1].time).toBe('14:50');
  });

  it('breaks timestamp ties deterministically by sequence', () => {
    const a = makeHistoryEntry(reading(), 1);
    const b = makeHistoryEntry(reading(), 2);
    expect(sortHistory([a, b]).map(e => e.seq)).toEqual([2, 1]);
    expect(sortHistory([b, a]).map(e => e.seq)).toEqual([2, 1]);
  });
});

describe('appendHistory', () => {
  it('appends and keeps the store newest-first', () => {
    let store: SignalHistoryEntry[] = [];
    for (const minutes of [0, 5, 10, 15]) {
      store = appendHistory(store, reading({ timestamp: BASE + minutes * 60_000 })).entries;
    }
    const timestamps = store.map(e => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('REGRESSION: a late-arriving older reading cannot jump the queue', () => {
    let store: SignalHistoryEntry[] = [];
    store = appendHistory(store, reading({ timestamp: BASE + 30 * 60_000 })).entries;
    store = appendHistory(store, reading({ timestamp: BASE + 10 * 60_000 })).entries;
    expect(store[0].timestamp).toBe(BASE + 30 * 60_000);
    expect(store[1].timestamp).toBe(BASE + 10 * 60_000);
  });

  it('ignores a duplicate publish for the same bar', () => {
    let store: SignalHistoryEntry[] = [];
    const first = appendHistory(store, reading({ timestamp: BASE }));
    store = first.entries;
    expect(first.appended).not.toBeNull();

    const second = appendHistory(store, reading({ timestamp: BASE + 1_000 }));
    expect(second.appended).toBeNull();
    expect(second.entries).toHaveLength(1);
  });

  it('does not dedupe across instruments', () => {
    let store: SignalHistoryEntry[] = [];
    store = appendHistory(store, reading({ instrumentId: 'GC' })).entries;
    const second = appendHistory(store, reading({ instrumentId: 'ES' }));
    expect(second.appended).not.toBeNull();
    expect(second.entries).toHaveLength(2);
  });

  it('does not dedupe across timeframes', () => {
    let store: SignalHistoryEntry[] = [];
    store = appendHistory(store, reading({ timeframe: '15m' })).entries;
    const second = appendHistory(store, reading({ timeframe: '1h' }));
    expect(second.appended).not.toBeNull();
    expect(second.entries).toHaveLength(2);
  });

  it('keeps the label consistent with the score on every appended entry', () => {
    let store: SignalHistoryEntry[] = [];
    for (const score of [-90, -40, -5, 5, 40, 90]) {
      store = appendHistory(store, reading({ score, timestamp: BASE + score * 1000 })).entries;
    }
    for (const entry of store) {
      expect(entry.label).toBe(labelFromScore(entry.score, DEFAULT_COMPASS_CONFIG));
    }
  });

  it('caps each series at maxEntries without dropping other series', () => {
    let store: SignalHistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      store = appendHistory(store, reading({ timestamp: BASE + i * 60_000 }), { maxEntries: 3 }).entries;
    }
    store = appendHistory(store, reading({ instrumentId: 'ES', timestamp: BASE }), { maxEntries: 3 }).entries;

    expect(entriesForKey(store, { instrumentId: 'GC', timeframe: '15m' }, 100)).toHaveLength(3);
    expect(entriesForKey(store, { instrumentId: 'ES', timeframe: '15m' }, 100)).toHaveLength(1);
  });
});

describe('entriesForKey', () => {
  it('partitions history by instrument and timeframe', () => {
    let store: SignalHistoryEntry[] = [];
    store = appendHistory(store, reading({ instrumentId: 'GC', timeframe: '15m', timestamp: BASE })).entries;
    store = appendHistory(store, reading({ instrumentId: 'ES', timeframe: '15m', timestamp: BASE + 60_000 })).entries;
    store = appendHistory(store, reading({ instrumentId: 'GC', timeframe: '1h', timestamp: BASE + 120_000 })).entries;

    const gc15 = entriesForKey(store, { instrumentId: 'GC', timeframe: '15m' });
    expect(gc15).toHaveLength(1);
    expect(gc15[0].instrumentId).toBe('GC');
    expect(gc15[0].timeframe).toBe('15m');

    const es15 = entriesForKey(store, { instrumentId: 'ES', timeframe: '15m' });
    expect(es15).toHaveLength(1);
    expect(es15[0].instrumentId).toBe('ES');
  });

  it('REGRESSION: switching instruments never mixes their rows in one list', () => {
    let store: SignalHistoryEntry[] = [];
    // Interleave two instruments a minute apart, as a fast symbol switch would.
    store = appendHistory(store, reading({ instrumentId: 'GC', timestamp: BASE })).entries;
    store = appendHistory(store, reading({ instrumentId: 'ES', timestamp: BASE + 60_000 })).entries;
    store = appendHistory(store, reading({ instrumentId: 'GC', timestamp: BASE + 120_000 })).entries;
    store = appendHistory(store, reading({ instrumentId: 'ES', timestamp: BASE + 180_000 })).entries;

    const gc = entriesForKey(store, { instrumentId: 'GC', timeframe: '15m' });
    expect(gc).toHaveLength(2);
    expect(gc.every(e => e.instrumentId === 'GC')).toBe(true);

    const es = entriesForKey(store, { instrumentId: 'ES', timeframe: '15m' });
    expect(es).toHaveLength(2);
    expect(es.every(e => e.instrumentId === 'ES')).toBe(true);
  });

  it('honours the limit', () => {
    let store: SignalHistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      store = appendHistory(store, reading({ timestamp: BASE + i * 60_000 })).entries;
    }
    expect(entriesForKey(store, { instrumentId: 'GC', timeframe: '15m' }, 4)).toHaveLength(4);
  });
});

describe('groupHistory', () => {
  it('groups into per-series buckets, newest first inside each', () => {
    let store: SignalHistoryEntry[] = [];
    for (const [instrumentId, timeframe, offset] of [
      ['GC', '15m', 0],
      ['GC', '1h', 60_000],
      ['ES', '15m', 120_000],
      ['GC', '15m', 180_000],
    ] as const) {
      store = appendHistory(store, reading({ instrumentId, timeframe, timestamp: BASE + offset })).entries;
    }

    const grouped = groupHistory(store, 20);
    const gc15 = grouped.get('GC|15m')!;
    expect(gc15).toHaveLength(2);
    expect(gc15[0].timestamp).toBeGreaterThan(gc15[1].timestamp);
    expect(grouped.get('ES|15m')).toHaveLength(1);
    expect(grouped.get('GC|1h')).toHaveLength(1);
  });
});

describe('ordering across a day boundary', () => {
  it('sorts by the full timestamp, so yesterday never outranks today', () => {
    const yesterdayLate = makeHistoryEntry(
      reading({ timestamp: new Date(2024, 4, 14, 16, 29).getTime() }),
      1
    );
    const todayEarly = makeHistoryEntry(reading({ timestamp: new Date(2024, 4, 15, 9, 5).getTime() }), 2);
    const sorted = sortHistory([yesterdayLate, todayEarly]);
    expect(sorted[0].date).toBe('2024-05-15');
    expect(sorted[0].time).toBe('09:05');
    expect(sorted[1].date).toBe('2024-05-14');
  });
});
