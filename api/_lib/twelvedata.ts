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

import type { Candle } from '../../src/core/types';
import { isEntitlementError, isRateLimitError } from './symbols';

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

  constructor(kind: VendorErrorKind, message: string) {
    super(message);
    this.name = 'TwelveDataError';
    this.kind = kind;
  }
}

/** Classify a vendor message into the kind the route maps onto ProviderError. */
export function classifyError(message: string, status = 0): VendorErrorKind {
  if (status === 429 || isRateLimitError(message)) return 'RATE_LIMIT';
  if (isEntitlementError(message)) return 'ENTITLEMENT';
  return 'UPSTREAM';
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
    response = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
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
    throw new TwelveDataError(classifyError(message, response.status), message);
  }

  if (!response.ok) {
    throw new TwelveDataError(
      classifyError(`HTTP ${response.status}`, response.status),
      `Twelve Data returned HTTP ${response.status}`
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
  const response = await fetch(`https://api.twelvedata.com/symbol_search?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const payload = (await response.json()) as SymbolSearchResponse;
  if (payload.status === 'error') {
    const message = payload.message ?? 'symbol_search failed';
    throw new TwelveDataError(classifyError(message, response.status), message);
  }
  return Array.isArray(payload.data) ? payload.data : [];
}
