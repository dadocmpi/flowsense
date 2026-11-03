// ============================================
// TWELVE DATA CREDIT METER (server-side)
// ============================================
// The Twelve Data instance of the shared per-minute meter
// (api/_lib/rateMeter.ts). Twelve Data meters API credits per minute and answers
// HTTP 429 with "You have run out of API credits for the current minute. N API
// credits were used, with the current limit being M." once the minute is spent.
// The vendor is the authority on how many credits were used, so its numbers win:
// when a response carries the `api-credits-used` header, the meter adopts that
// value instead of its own tally.
//
// Every Twelve Data call goes through this meter. Alpaca has its own instance
// (api/_lib/alpacaMeter.ts), so a rate limit on one vendor never blocks the
// other. This module keeps the original Twelve Data surface — named constants
// and free functions — so nothing downstream had to change when the meter was
// generalised.

import { createRateMeter } from './rateMeter.js';

export type { CreditCost, MeterSnapshot, VendorUsage } from './rateMeter.js';
export { CreditLimitError, readVendorUsage } from './rateMeter.js';

/** Default per-minute ceiling. Twelve Data's Basic plan allows 8 credits/minute. */
export const DEFAULT_MINUTE_CREDITS = 8;

/**
 * Credits a cold instance may spend in its first COLD_START_WINDOW_MS.
 *
 * One credit is one (symbol, timeframe) load. The app loads every timeframe on
 * open, and Gold has seven, so the cap must admit a full Gold load (7) while
 * still refusing a runaway loop on a fresh instance. It stays at or below the
 * plan's per-minute ceiling.
 */
export const COLD_START_MAX_CREDITS = 7;

/** How long the cold-start cap applies after the instance first spends (ms). */
export const COLD_START_WINDOW_MS = 60_000;

/** The configured ceiling, from env, validated. */
function envLimit(): number {
  const parsed = Number.parseInt((process.env.TWELVE_DATA_CREDITS_PER_MINUTE ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MINUTE_CREDITS;
}

const meter = createRateMeter({
  coldStartMax: COLD_START_MAX_CREDITS,
  coldStartWindowMs: COLD_START_WINDOW_MS,
  envLimit,
  label: 'twelvedata',
});

/** Whether a call costing `credits` may be made now. */
export const checkCredits = meter.check;

/** Raise a CreditLimitError when a call is not allowed. */
export const assertCredits = meter.assert;

/** Record the cost of a completed request. */
export const recordCredits = meter.record;

/** Mark the meter exhausted for the rest of the wall-clock minute. */
export const markExhausted = meter.markExhausted;

/** The current meter state, for the status route and the log line. */
export const meterSnapshot = meter.snapshot;

/** Test seam: forget everything the meter has learned. */
export const resetCreditMeter = meter.reset;
