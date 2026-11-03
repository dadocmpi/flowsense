// ============================================
// ALPACA RATE METER (server-side)
// ============================================
// The Alpaca instance of the shared per-minute meter (api/_lib/rateMeter.ts).
//
// Alpaca's market data rate limit is expressed in REQUESTS per minute, not
// credits, and the free plan allows 200. Unlike Twelve Data, Alpaca does not
// report usage in response headers, so the meter counts the calls it makes: one
// multi-symbol bars request is one request, however many symbols it carries.
//
// It is a SEPARATE instance from the Twelve Data meter, so a Twelve Data credit
// limit never blocks an Alpaca request and vice versa — the two providers are
// independent budgets, which is what keeps one vendor's problem from taking the
// whole page down.

import { createRateMeter } from './rateMeter.js';

export type { CreditCost, MeterSnapshot, VendorUsage } from './rateMeter.js';
export { CreditLimitError } from './rateMeter.js';

/** Default per-minute request ceiling. Alpaca's free plan allows 200/min. */
export const DEFAULT_ALPACA_REQUESTS_PER_MINUTE = 200;

/**
 * Requests a cold Alpaca instance may make in its first COLD_START_WINDOW_MS.
 *
 * One full load is seven requests — one per timeframe, each carrying all three
 * Alpaca symbols — so the cold cap must be high enough to let that first load
 * through while still refusing a runaway loop on a fresh instance.
 */
export const ALPACA_COLD_START_MAX_REQUESTS = 20;

/** How long the cold-start cap applies after the instance first spends (ms). */
export const ALPACA_COLD_START_WINDOW_MS = 60_000;

/** The configured ceiling, from env, validated. */
export function alpacaEnvLimit(): number {
  const parsed = Number.parseInt((process.env.ALPACA_REQUESTS_PER_MINUTE ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ALPACA_REQUESTS_PER_MINUTE;
}

export const alpacaMeter = createRateMeter({
  coldStartMax: ALPACA_COLD_START_MAX_REQUESTS,
  coldStartWindowMs: ALPACA_COLD_START_WINDOW_MS,
  envLimit: alpacaEnvLimit,
  label: 'alpaca',
});

/** Whether an Alpaca request may be made now. */
export const assertAlpacaRequest = alpacaMeter.assert;

/** Record one completed Alpaca request. */
export const recordAlpacaRequest = alpacaMeter.record;

/** Mark the Alpaca meter exhausted for the rest of the wall-clock minute. */
export const markAlpacaExhausted = alpacaMeter.markExhausted;

/** The current Alpaca meter state, for the status and health routes. */
export const alpacaMeterSnapshot = alpacaMeter.snapshot;

/** Note that one outbound Alpaca request was actually made (for /api/health). */
export const noteAlpacaCall = alpacaMeter.noteCall;

/** How many Alpaca requests were made in the current wall-clock minute. */
export const alpacaCallsThisMinute = alpacaMeter.callsThisMinute;

/** Epoch ms of the last Alpaca request, or null. */
export const alpacaLastCallAt = alpacaMeter.lastCallAt;

/** Test seam: forget everything the meter has learned. */
export const resetAlpacaMeter = alpacaMeter.reset;
