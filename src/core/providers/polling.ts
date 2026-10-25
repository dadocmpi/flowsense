// ============================================
// POLLING / CACHE TIMING
// ============================================
// One source of truth for how often each timeframe is refreshed, shared by the
// browser poller and the server-side candle cache. Keeping them in one place is
// what stops the two from drifting apart and quietly burning credits.
//
// Pure constants: no I/O, no DOM, safe to import from a serverless function.
//
// The rule of thumb: poll a timeframe at a fraction of its own bar length, so a
// new bar is picked up soon after it opens without hammering the vendor. The
// server cache TTL sits just under the poll interval, so a user's poll normally
// gets fresh data while simultaneous users share one vendor call.

import type { Timeframe } from '../types';

/** How often the client re-fetches each timeframe over REST (ms). */
export const POLL_INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 20_000,
  '5m': 45_000,
  '15m': 60_000,
  '30m': 90_000,
  '1h': 120_000,
  '4h': 300_000,
  '1D': 600_000,
  '1W': 1_800_000,
};

/**
 * How long a server-side candle payload stays valid (ms).
 *
 * Set to 80% of the poll interval: short enough that a poller still sees a new
 * bar promptly, long enough that several users on the same instrument and
 * timeframe collapse into a single vendor call.
 */
export const SERVER_CACHE_TTL_MS: Record<Timeframe, number> = Object.fromEntries(
  (Object.entries(POLL_INTERVAL_MS) as Array<[Timeframe, number]>).map(([timeframe, interval]) => [
    timeframe,
    Math.round(interval * 0.8),
  ])
) as Record<Timeframe, number>;

/** How long a resolved symbol choice is trusted before re-verifying (ms). */
export const SYMBOL_RESOLUTION_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How often the live PRICE is polled when no tick feed is available (ms).
 *
 * Every poll costs a credit, so this is the single biggest lever on the spend.
 * At 30s that is at most two calls a minute per open tab — a new 1m bar is
 * picked up within half its own length, which is prompt enough for a compass,
 * while a five-minute chart does not pay for sub-minute precision it cannot use.
 *
 * When a tick feed IS available this is unused: a socket costs no request
 * credits.
 */
export const PRICE_POLL_INTERVAL_MS = 30_000;

export function pollIntervalFor(timeframe: Timeframe): number {
  return POLL_INTERVAL_MS[timeframe] ?? 60_000;
}

export function cacheTtlFor(timeframe: Timeframe): number {
  return SERVER_CACHE_TTL_MS[timeframe] ?? 60_000;
}
