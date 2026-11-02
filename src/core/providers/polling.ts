// ============================================
// POLLING / CACHE TIMING
// ============================================
// One source of truth for how often each timeframe is refreshed, shared by the
// browser poller and the server-side candle cache. Keeping them in one place is
// what stops the two from drifting apart and quietly burning credits.
//
// Pure constants: no I/O, no DOM, safe to import from a serverless function.
//
// The cadence SCALES WITH THE PLAN. The tables below are the conservative
// baseline for the shipped 8-credits/minute plan; `src/config/credits.ts`
// derives a faster cadence when TWELVE_DATA_CREDITS_PER_MINUTE is higher, so
// upgrading the plan is an environment change and needs no code change.

import type { Timeframe } from '../types.js';
import {
  DEFAULT_CREDITS_PER_MINUTE,
  pollIntervalForPlan,
  serverCacheTtlForPlan,
} from '../../config/credits.js';

/** How often the client re-fetches each timeframe over REST (ms), default plan. */
export const POLL_INTERVAL_MS: Record<Timeframe, number> = pollIntervalForPlan(DEFAULT_CREDITS_PER_MINUTE);

/**
 * How long a server-side candle payload stays valid (ms), default plan.
 *
 * Set to 80% of the poll interval: short enough that a poller still sees a new
 * bar promptly, long enough that several users on the same instrument and
 * timeframe collapse into a single vendor call.
 */
export const SERVER_CACHE_TTL_MS: Record<Timeframe, number> = serverCacheTtlForPlan(DEFAULT_CREDITS_PER_MINUTE);

/** How long a resolved symbol choice is trusted before re-verifying (ms). */
export const SYMBOL_RESOLUTION_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How often the live PRICE is polled when no tick feed is available (ms).
 *
 * The live-quote cadence now comes from LIVE_POLL_INTERVAL_MS (default 60s),
 * which is applied inside the live-quote provider; this constant is the
 * default plan's value, kept for callers that only need a sane fallback.
 */
export const PRICE_POLL_INTERVAL_MS = 60_000;

export function pollIntervalFor(timeframe: Timeframe, creditsPerMinute = DEFAULT_CREDITS_PER_MINUTE): number {
  return pollIntervalForPlan(creditsPerMinute)[timeframe] ?? 60_000;
}

export function cacheTtlFor(timeframe: Timeframe, creditsPerMinute = DEFAULT_CREDITS_PER_MINUTE): number {
  return serverCacheTtlForPlan(creditsPerMinute)[timeframe] ?? 60_000;
}
