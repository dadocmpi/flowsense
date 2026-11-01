// ============================================
// POLLING / CACHE TIMING
// ============================================
// One source of truth for how long a loaded candle series stays fresh. The
// per-timeframe TTLs live in the compass config (`timeframeTtlMs`) because they
// are a product decision, and this module exposes them to both the browser and
// the server-side candle cache so the two can never drift apart.
//
// Pure constants: no I/O, no DOM, safe to import from a serverless function.
//
// The rule of thumb: a longer timeframe changes more slowly, so it is cached for
// longer. The server cache keyed by (symbol, timeframe) then lets several users
// watching the same instrument and timeframe collapse into ONE vendor call.

import type { Timeframe } from '../types.js';
import { DEFAULT_COMPASS_CONFIG } from '../../config/compass.js';

/**
 * How long a loaded candle payload stays valid, per timeframe (ms).
 *
 * Read straight from the compass config, so there is exactly one place to tune
 * it. A timeframe re-read inside this window costs no vendor credit.
 */
export const TIMEFRAME_TTL_MS: Record<Timeframe, number> = DEFAULT_COMPASS_CONFIG.timeframeTtlMs;

/** Backwards-compatible alias: the server cache TTL IS the timeframe TTL. */
export const SERVER_CACHE_TTL_MS: Record<Timeframe, number> = TIMEFRAME_TTL_MS;

/** The client refresh cadence: how often an expired timeframe is re-read (ms). */
export const POLL_INTERVAL_MS: Record<Timeframe, number> = TIMEFRAME_TTL_MS;

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
  return TIMEFRAME_TTL_MS[timeframe] ?? 60_000;
}
