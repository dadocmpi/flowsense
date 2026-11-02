// ============================================
// TIMEFRAME LOAD QUEUE (pure)
// ============================================
// The decisions behind the auto-load of all seven timeframes, pulled out of the
// React hook so they can be unit tested without a browser or a market:
//
//   * WHICH timeframe loads first — the one the user is looking at, then the rest
//     highest-first, so the entry check's heaviest inputs arrive early
//   * WHICH timeframes are worth (re)queueing — the never-loaded and the
//     rate-limited ones, but NEVER a permanent failure
//
// No I/O, no clock of its own: `now` is always passed in.

import type { Timeframe } from './types';
import { TIMEFRAMES } from './types';

/**
 * Load priority, highest timeframe first. A higher timeframe carries more weight
 * in the entry check, so it is worth having before the noisier short ones.
 */
export const LOAD_PRIORITY: Timeframe[] = ['1D', '4h', '1h', '30m', '15m', '5m', '1m'];

/**
 * The order the timeframes should be fetched in for one asset: the SELECTED
 * timeframe first so the compasses and the table fill immediately, then the base
 * timeframe (the live price is merged from it), then the rest highest-first.
 */
export function loadOrder(
  selected: Timeframe,
  base?: Timeframe,
  priority: Timeframe[] = LOAD_PRIORITY
): Timeframe[] {
  const head: Timeframe[] = [selected];
  if (base && base !== selected) head.push(base);
  return [...head, ...priority.filter(timeframe => !head.includes(timeframe))];
}

/**
 * The per-(asset, timeframe) load status.
 *
 *  - `idle`      queued, not started
 *  - `loading`   a request is in flight
 *  - `loaded`    real data is in memory
 *  - `waiting`   the credit window blocked the request; worth retrying later
 *  - `error`     a non-rate-limit failure; NEVER retried automatically
 */
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'waiting' | 'error';

/**
 * Whether a timeframe should be (re)queued.
 *
 * A `loaded` timeframe is served from memory. A `loading` one is already in
 * flight. A `waiting` one is worth another try once the credit window resets.
 * An `error` one is NOT: a symbol or plan problem does not fix itself, and a
 * retry loop against it is exactly how the account stays pinned at its ceiling.
 */
export function shouldQueue(status: LoadStatus): boolean {
  return status === 'idle' || status === 'waiting';
}

/**
 * The timeframes worth queueing for an asset, in load order, given what each one
 * currently is.
 */
export function queueable(
  selected: Timeframe,
  statusOf: (timeframe: Timeframe) => LoadStatus,
  base?: Timeframe,
  priority: Timeframe[] = LOAD_PRIORITY
): Timeframe[] {
  return loadOrder(selected, base, priority).filter(timeframe => shouldQueue(statusOf(timeframe)));
}

/** One cached series, with the time it was fetched. */
export interface CachedTimeframe<T> {
  series: T;
  fetchedAt: number;
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
  timeframes: readonly Timeframe[] = TIMEFRAMES,
  ttlMs: Record<Timeframe, number>,
  now: number,
  safetyMs = 0
): Timeframe[] {
  return timeframes.filter(
    timeframe => !isFresh(cache[timeframe]?.fetchedAt, ttlMs[timeframe] ?? 0, now, safetyMs)
  );
}
