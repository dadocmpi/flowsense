// ============================================
// BINANCE RATE METER (server-side)
// ============================================
// The Binance instance of the shared per-minute meter (api/_lib/rateMeter.ts).
//
// Binance's public market-data endpoints are weight-based rather than credit- or
// request-based, and a 1-minute interval runs at 6000 request weight a minute.
// The meter therefore counts REQUESTS, like Alpaca's, with a ceiling sized well
// inside the public allowance: an order-flow reading costs two calls, so a busy
// minute still leaves a wide margin.
//
// It is a SEPARATE instance from the Twelve Data and Alpaca meters, so a Twelve
// Data credit limit can never block a Binance call and vice versa.

import { createRateMeter } from './rateMeter.js';

export type { CreditCost, MeterSnapshot, VendorUsage } from './rateMeter.js';
export { CreditLimitError } from './rateMeter.js';

/** Default per-minute request ceiling. */
export const DEFAULT_BINANCE_REQUESTS_PER_MINUTE = 600;

/**
 * Requests a cold Binance instance may make in its first cold-start window.
 *
 * One order-flow reading is two calls, and the client asks for it at most once
 * per timeframe, so the cold cap is set to let the first few readings through.
 */
export const BINANCE_COLD_START_MAX_REQUESTS = 40;

/** How long the cold-start cap applies after the instance first spends (ms). */
export const BINANCE_COLD_START_WINDOW_MS = 60_000;

/** The configured ceiling, from env, validated. */
export function binanceEnvLimit(): number {
  const parsed = Number.parseInt((process.env.BINANCE_REQUESTS_PER_MINUTE ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BINANCE_REQUESTS_PER_MINUTE;
}

export const binanceMeter = createRateMeter({
  coldStartMax: BINANCE_COLD_START_MAX_REQUESTS,
  coldStartWindowMs: BINANCE_COLD_START_WINDOW_MS,
  envLimit: binanceEnvLimit,
  label: 'binance',
});

/** Whether a Binance request may be made now. */
export const assertBinanceRequest = binanceMeter.assert;

/** Record one completed Binance request. */
export const recordBinanceRequest = binanceMeter.record;

/** Mark the Binance meter exhausted for the rest of the wall-clock minute. */
export const markBinanceExhausted = binanceMeter.markExhausted;

/** The current Binance meter state, for the status and health routes. */
export const binanceMeterSnapshot = binanceMeter.snapshot;

/** Note that one outbound Binance request was actually made (for /api/health). */
export const noteBinanceCall = binanceMeter.noteCall;

/** How many Binance requests were made in the current wall-clock minute. */
export const binanceCallsThisMinute = binanceMeter.callsThisMinute;

/** Epoch ms of the last Binance request, or null. */
export const binanceLastCallAt = binanceMeter.lastCallAt;

/** Test seam: forget everything the meter has learned. */
export const resetBinanceMeter = binanceMeter.reset;
