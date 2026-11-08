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

import type { Timeframe } from '../types.js';

/** How often the client re-fetches each timeframe over REST (ms). */
export const POLL_INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 20_000,
  '5m': 45_000,
  '15m': 60_000,
  '30m': 90_000,
  '1h': 120_000,
  '4h': 300_000,
  '1D': 600_000,
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
 * How often the client re-fetches each timeframe over REST, per provider (ms).
 *
 * Twelve Data and Alpaca are metered differently — credits versus requests — so
 * they get their own cadence rather than sharing one. Alpaca allows far more
 * requests a minute, so it can be polled a little more eagerly, but the two stay
 * deliberately close: both are REST polls, and neither should outrun the server
 * cache it shares with every other open tab.
 */
export const ALPACA_POLL_INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 15_000,
  '5m': 40_000,
  '15m': 60_000,
  '30m': 90_000,
  '1h': 120_000,
  '4h': 300_000,
  '1D': 600_000,
};

/** The poll cadence for one provider and timeframe (ms). */
export function pollIntervalForProvider(provider: 'twelvedata' | 'alpaca', timeframe: Timeframe): number {
  return provider === 'alpaca' ? ALPACA_POLL_INTERVAL_MS[timeframe] : POLL_INTERVAL_MS[timeframe];
}

/**
 * Per-provider server cache TTL (ms), by timeframe.
 *
 * Each provider's TTL sits just under ITS OWN poll interval, for the same reason
 * the shared rule above does: a poller still sees a new bar, while simultaneous
 * users collapse into one vendor call. Deriving Alpaca's TTL from Alpaca's cadence
 * keeps the two from drifting.
 */
export const ALPACA_SERVER_CACHE_TTL_MS: Record<Timeframe, number> = Object.fromEntries(
  (Object.entries(ALPACA_POLL_INTERVAL_MS) as Array<[Timeframe, number]>).map(([timeframe, interval]) => [
    timeframe,
    Math.round(interval * 0.8),
  ])
) as Record<Timeframe, number>;

/** The server cache TTL for one provider and timeframe (ms). */
export function cacheTtlForProvider(provider: 'twelvedata' | 'alpaca', timeframe: Timeframe): number {
  return provider === 'alpaca' ? ALPACA_SERVER_CACHE_TTL_MS[timeframe] : SERVER_CACHE_TTL_MS[timeframe];
}

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

/**
 * How often the ORDER-FLOW reading is refreshed over REST (ms).
 *
 * Order flow is a separate venue from the candles and is read on its own. The
 * reading is a rolling window over the venue's tape, so it is refreshed faster
 * than a candle: the strength bar should track the tape within a few seconds.
 * The client coalesces its re-renders to at most ~2 per second regardless, so a
 * fast refresh cannot flicker the bar.
 *
 * When the venue is closed the reading does not change, so the caller backs off
 * to `ORDER_FLOW_CLOSED_POLL_INTERVAL_MS`.
 */
export const ORDER_FLOW_POLL_INTERVAL_MS = 3_000;

/** Refresh cadence while the venue's market is closed (ms). */
export const ORDER_FLOW_CLOSED_POLL_INTERVAL_MS = 60_000;

export function pollIntervalFor(timeframe: Timeframe): number {
  return POLL_INTERVAL_MS[timeframe] ?? 60_000;
}

export function cacheTtlFor(timeframe: Timeframe): number {
  return SERVER_CACHE_TTL_MS[timeframe] ?? 60_000;
}
