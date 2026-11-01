// ============================================
// FEED CACHE / LOAD ORDER (pure)
// ============================================
// The two decisions that keep the credit spend bounded, pulled out of the React
// hook so they can be unit tested without a browser or a market:
//
//   * WHICH timeframe loads first — the one the user is looking at, then the rest
//     highest-first, so the entry check's heaviest inputs arrive early
//   * WHICH timeframes are EXPIRED — i.e. worth spending a credit on again
//
// No I/O, no clock of its own: `now` is always passed in.

import type { Timeframe } from './types';

/** One cached series, with the time it was fetched. */
export interface CachedTimeframe<T> {
  series: T;
  fetchedAt: number;
}

/**
 * Load priority, highest timeframe first. A higher timeframe carries more weight
 * in the entry check, so it is worth having before the noisier short ones.
 */
export const LOAD_PRIORITY: Timeframe[] = ['1D', '4h', '1h', '30m', '15m', '5m', '1m'];

/**
 * The order the timeframes should be fetched in for one asset: the SELECTED
 * timeframe first so the compasses and the table fill immediately, then the rest
 * highest-first.
 */
export function loadOrder(selected: Timeframe, priority: Timeframe[] = LOAD_PRIORITY): Timeframe[] {
  return [selected, ...priority.filter(timeframe => timeframe !== selected)];
}

/**
 * Whether a series fetched at `fetchedAt` is still inside its TTL at `now`.
 *
 * `safetyMs` shrinks the window so a client refresh lands INSIDE the server's own
 * cache TTL, which is what makes a refresh cost no extra credit.
 */
export function isFresh(
  fetchedAt: number | null | undefined,
  ttlMs: number,
  now: number,
  safetyMs = 0
): boolean {
  if (fetchedAt === null || fetchedAt === undefined) return false;
  if (!Number.isFinite(fetchedAt)) return false;
  return now - fetchedAt < ttlMs - safetyMs;
}

/**
 * The timeframes worth re-fetching: everything not still fresh in the cache.
 * A timeframe that has never been fetched is expired by definition.
 */
export function expiredTimeframes<T>(
  cache: Partial<Record<Timeframe, CachedTimeframe<T>>>,
  timeframes: readonly Timeframe[],
  ttlMs: Record<Timeframe, number>,
  now: number,
  safetyMs = 0
): Timeframe[] {
  return timeframes.filter(
    timeframe => !isFresh(cache[timeframe]?.fetchedAt, ttlMs[timeframe] ?? 0, now, safetyMs)
  );
}
