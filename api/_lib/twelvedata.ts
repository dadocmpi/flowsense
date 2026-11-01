// ============================================
// TWELVE DATA ADAPTER (server-side)
// ============================================
// The simplest source to get running with a single API key from the
// environment, which is why it is the implementation that ships.
//
// Endpoint: https://api.twelvedata.com/time_series
//   symbol    a candidate from api/_lib/symbols.ts (futures first, proxy next)
//   interval  1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week
//   timezone  pinned to UTC, so a payload never depends on where the serverless
//             function runs
//   apikey    TWELVE_DATA_API_KEY (server-side only, never in the bundle)
//
// The response carries `values` newest-first, each with datetime/open/high/
// low/close/volume. We reverse them to oldest-first and normalise the datetime
// to the shared "YYYY-MM-DD HH:MM:SS" UTC form the rest of the app expects.
//
// ALL indicators are computed locally from these candles. The vendor's own
// indicator endpoints are deliberately not used: they would cost a credit per
// indicator per timeframe per refresh, and the compass already has tested local
// math for every one of them.
//
// Twelve Data reports most failures as HTTP 200 with status:"error", so the
// error KIND is read from the message (see classifyError) rather than the status
// code. That is what lets the client distinguish "not entitled on your plan"
// from "you are out of credits" from "the vendor is down".
//
// Every request here runs through the credit meter (api/_lib/creditMeter.ts):
// the meter is checked before the call and the vendor's own api-credits-used /
// api-credits-left headers are recorded after it, and one line is logged per
// request. There is no path in this file that reaches the vendor without it.

import type { Candle } from '../../src/core/types.js';
import { isEntitlementError, isRateLimitError } from './symbols.js';
import {
  assertCredits,
  CreditLimitError,
  markExhausted,
  meterSnapshot,
  readVendorUsage,
  recordCredits,
  type MeterSnapshot,
  type VendorUsage,
} from './creditMeter.js';

export interface TimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

export interface TimeSeriesResponse {
  meta?: {
    symbol?: string;
    interval?: string;
    exchange?: string;
    currency?: string;
    /** Vendor's own instrument classification, e.g. "Physical Currency". */
    type?: string;
  };
  values?: TimeSeriesValue[];
  status?: string;
  code?: number;
  message?: string;
}

/** App timeframe -> Twelve Data interval. */
export const TWELVEDATA_INTERVALS: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '1D': '1day',
  '1W': '1week',
};

export type VendorErrorKind = 'ENTITLEMENT' | 'RATE_LIMIT' | 'NETWORK' | 'UPSTREAM';

/** An upstream failure with the kind already worked out. */
export class TwelveDataError extends Error {
  kind: VendorErrorKind;
  /** When a rate limit is in force, epoch ms the meter resets. */
  retryAfterMs?: number;

  constructor(kind: VendorErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'TwelveDataError';
    this.kind = kind;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

/** Classify a vendor message into the kind the route maps onto ProviderError. */
export function classifyError(message: string, status = 0): VendorErrorKind {
  if (status === 429 || isRateLimitError(message)) return 'RATE_LIMIT';
  if (isEntitlementError(message)) return 'ENTITLEMENT';
  return 'UPSTREAM';
}

/**
 * Pull the "N API credits were used" figure out of a vendor rate-limit message.
 *
 * The vendor's own number beats our tally, so it is adopted when present. Returns
 * undefined for any other message, leaving the meter to fall back on its count.
 */
export function parseReportedCredits(message: string): number | undefined {
  const match = /(\d+)\s+api\s+credits?\s+were\s+used/i.exec(message);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * One server-side line per vendor request.
 *
 * Deliberately a single line: timestamp, endpoint, symbol, timeframe, the credits
 * assumed, the vendor's response status, and — when the response carried them —
 * the vendor's own credit-usage figures, which are the source of truth. This is
 * the record that answers "what spent the credits?" after the fact.
 */
export function logVendorRequest(fields: {
  endpoint: string;
  symbol: string;
  timeframe?: string;
  credits: number;
  status: number | string;
  usage?: VendorUsage;
  meter: MeterSnapshot;
  note?: string;
}): void {
  const parts = [
    `[twelvedata] ${new Date().toISOString()}`,
    `endpoint=${fields.endpoint}`,
    `symbol=${fields.symbol}`,
    fields.timeframe ? `timeframe=${fields.timeframe}` : null,
    `credits=${fields.credits}`,
    `status=${fields.status}`,
    fields.usage?.used !== undefined ? `vendorUsed=${fields.usage.used}` : 'vendorUsed=-',
    fields.usage?.left !== undefined ? `vendorLeft=${fields.usage.left}` : 'vendorLeft=-',
    `meterUsed=${fields.meter.used}/${fields.meter.limit}`,
    fields.meter.exhausted ? 'meter=EXHAUSTED' : 'meter=OK',
    fields.note ? `note=${fields.note}` : null,
  ].filter((part): part is string => part !== null);

  console.log(parts.join(' '));
}

/**
 * Run one vendor call under the meter.
 *
 * The order matters and is the whole point of the module: the meter is consulted
 * BEFORE the fetch (so a call that would breach the minute is refused without
 * spending anything), and the response is recorded AFTER it (so the next call
 * sees the truth). Every vendor request in this codebase goes through here.
 */
async function meteredFetch(
  url: string,
  cost: { endpoint: string; symbol: string; timeframe?: string; credits: number },
  init: RequestInit
): Promise<{ response: Response; usage: VendorUsage }> {
  try {
    assertCredits(cost.credits);
  } catch (error) {
    if (error instanceof CreditLimitError) {
      logVendorRequest({
        endpoint: cost.endpoint,
        symbol: cost.symbol,
        timeframe: cost.timeframe,
        credits: cost.credits,
        status: 'BLOCKED',
        meter: meterSnapshot(),
        note: error.message,
      });
      throw new TwelveDataError('RATE_LIMIT', error.message, error.resetAt - Date.now());
    }
    throw error;
  }

  const response = await fetch(url, init);
  const usage = readVendorUsage(response.headers);
  const meter = recordCredits(cost, usage);
  logVendorRequest({
    endpoint: cost.endpoint,
    symbol: cost.symbol,
    timeframe: cost.timeframe,
    credits: cost.credits,
    status: response.status,
    usage,
    meter,
  });
  return { response, usage };
}

function num(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalise a vendor datetime to the shared UTC candle form.
 *
 * Twelve Data returns either "YYYY-MM-DD HH:MM:SS" (already UTC for the
 * intraday intervals when the request has no timezone override) or a bare
 * "YYYY-MM-DD" for daily and weekly bars. Daily bars are anchored at midnight
 * UTC.
 */
export function normalizeDatetime(datetime: string): string {
  const trimmed = datetime.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed} 00:00:00`;
  // Already "YYYY-MM-DD HH:MM:SS"; keep seconds if present, add them if not.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  // ISO with a T; convert to the shared form.
  const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
  if (!Number.isFinite(parsed.getTime())) return trimmed;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${p(parsed.getUTCMonth() + 1)}-${p(parsed.getUTCDate())} ${p(parsed.getUTCHours())}:${p(parsed.getUTCMinutes())}:${p(parsed.getUTCSeconds())}`;
}

/**
 * Turn a Twelve Data payload into candles, oldest first. Throws the vendor's
 * own message when the API reports an error, so the UI can show why.
 */
export function parseTimeSeries(payload: TimeSeriesResponse): Candle[] {
  if (payload.status === 'error') {
    const message = payload.message ?? 'Twelve Data returned an error';
    throw new TwelveDataError(classifyError(message, payload.code ?? 0), message);
  }
  // An empty array is a real "no bars at this interval", not an error. The
  // caller treats it as a candidate failure and moves to the next symbol.
  if (!Array.isArray(payload.values)) return [];

  const candles: Candle[] = payload.values
    .map(value => ({
      datetime: normalizeDatetime(value.datetime),
      open: num(value.open),
      high: num(value.high),
      low: num(value.low),
      close: num(value.close),
      volume: num(value.volume),
    }))
    .filter(candle => Number.isFinite(candle.close) && candle.close > 0);

  // The vendor sends newest-first; the app expects oldest-first.
  return candles.sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export interface FetchTimeSeriesParams {
  symbol: string;
  timeframe: string;
  limit: number;
  apiKey: string;
  signal?: AbortSignal;
}

export interface TimeSeriesResult {
  candles: Candle[];
  symbol: string;
  interval: string;
  /** The vendor's own instrument type, when it reports one (e.g. "Physical Currency"). */
  instrumentType?: string;
  exchange?: string;
}

export async function fetchTimeSeries({
  symbol,
  timeframe,
  limit,
  apiKey,
  signal,
}: FetchTimeSeriesParams): Promise<TimeSeriesResult> {
  const interval = TWELVEDATA_INTERVALS[timeframe] ?? '5min';
  const capped = Math.max(1, Math.min(5000, limit));
  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(capped),
    apikey: apiKey,
    format: 'JSON',
    // Pinned so the payload does not depend on where this function runs.
    timezone: 'UTC',
  });

  let response: Response;
  try {
    ({ response } = await meteredFetch(
      `https://api.twelvedata.com/time_series?${params.toString()}`,
      { endpoint: 'time_series', symbol, timeframe, credits: 1 },
      { signal, headers: { Accept: 'application/json' } }
    ));
  } catch (error) {
    if (error instanceof TwelveDataError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new TwelveDataError('NETWORK', 'Could not reach Twelve Data');
  }

  // Twelve Data signals most errors with HTTP 200 and a status field, but a
  // real HTTP failure must still be reported as one.
  let payload: TimeSeriesResponse;
  try {
    payload = (await response.json()) as TimeSeriesResponse;
  } catch {
    throw new TwelveDataError('UPSTREAM', `Twelve Data returned HTTP ${response.status} with an unreadable body`);
  }

  if (payload.status === 'error') {
    const message = payload.message ?? 'Twelve Data returned an error';
    const kind = classifyError(message, response.status);
    throw new TwelveDataError(kind, message, kind === 'RATE_LIMIT' ? handleRateLimit(message) : undefined);
  }

  if (!response.ok) {
    const kind = classifyError(`HTTP ${response.status}`, response.status);
    throw new TwelveDataError(
      kind,
      `Twelve Data returned HTTP ${response.status}`,
      kind === 'RATE_LIMIT' ? handleRateLimit('') : undefined
    );
  }

  return {
    candles: parseTimeSeries(payload),
    symbol: payload.meta?.symbol ?? symbol,
    interval: payload.meta?.interval ?? interval,
    instrumentType: payload.meta?.type,
    exchange: payload.meta?.exchange,
  };
}

/**
 * Mark the meter exhausted for the rest of the minute and return the reset delay.
 *
 * The vendor reported a rate limit, so no further call can succeed until the
 * minute rolls over. Stopping here is what keeps a blocked request from turning
 * into a retry storm that keeps the account pinned at its ceiling.
 */
function handleRateLimit(message: string): number {
  const snapshot = markExhausted(Date.now(), parseReportedCredits(message));
  return Math.max(0, snapshot.resetAt - Date.now());
}

// ============================================
// SYMBOL SEARCH (used by `npm run check:symbols`)
// ============================================

export interface SymbolSearchMatch {
  symbol: string;
  instrument_name?: string;
  exchange?: string;
  instrument_type?: string;
  country?: string;
  currency?: string;
}

export interface SymbolSearchResponse {
  data?: SymbolSearchMatch[];
  status?: string;
  message?: string;
}

export async function searchSymbols(query: string, apiKey: string, signal?: AbortSignal): Promise<SymbolSearchMatch[]> {
  const params = new URLSearchParams({ symbol: query, apikey: apiKey, format: 'JSON' });
  let response: Response;
  try {
    ({ response } = await meteredFetch(
      `https://api.twelvedata.com/symbol_search?${params.toString()}`,
      { endpoint: 'symbol_search', symbol: query, credits: 1 },
      { signal, headers: { Accept: 'application/json' } }
    ));
  } catch (error) {
    if (error instanceof TwelveDataError) throw error;
    throw new TwelveDataError('NETWORK', 'Could not reach Twelve Data');
  }
  const payload = (await response.json()) as SymbolSearchResponse;
  if (payload.status === 'error') {
    const message = payload.message ?? 'symbol_search failed';
    const kind = classifyError(message, response.status);
    throw new TwelveDataError(kind, message, kind === 'RATE_LIMIT' ? handleRateLimit(message) : undefined);
  }
  return Array.isArray(payload.data) ? payload.data : [];
}
