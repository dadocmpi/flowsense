// ============================================
// TWELVE DATA ADAPTER (server-side)
// ============================================
// The simplest source to get running with a single API key from the
// environment, which is why it is the implementation that ships.
//
// Endpoint: https://api.twelvedata.com/time_series
//   symbol    the continuous front-month contract (GC1!, ES1!, YM1!)
//   interval 1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week
//   apikey   FUTURES_API_KEY (server-side only)
//
// The response carries `values` newest-first, each with datetime/open/high/
// low/close/volume. We reverse them to oldest-first and normalise the datetime
// to the shared "YYYY-MM-DD HH:MM:SS" UTC form the rest of the app expects.
//
// A Twelve Data plan may or may not include futures; if the symbol is not
// entitled the API answers with an error status, which is surfaced verbatim
// rather than papered over.

import type { Candle } from '../../src/core/types';

export interface TimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

export interface TimeSeriesResponse {
  meta?: { symbol?: string; interval?: string; exchange?: string; currency?: string };
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
    throw new Error(payload.message ?? 'Twelve Data returned an error');
  }
  if (!Array.isArray(payload.values)) {
    throw new Error('Twelve Data returned no values');
  }

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

export async function fetchTimeSeries({
  symbol,
  timeframe,
  limit,
  apiKey,
  signal,
}: FetchTimeSeriesParams): Promise<{ candles: Candle[]; symbol: string; interval: string }> {
  const interval = TWELVEDATA_INTERVALS[timeframe] ?? '5min';
  const capped = Math.max(1, Math.min(5000, limit));
  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(capped),
    apikey: apiKey,
    format: 'JSON',
  });

  const response = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  // Twelve Data signals most errors with HTTP 200 and a status field, but a
  // real HTTP failure must still be reported as one.
  let payload: TimeSeriesResponse;
  try {
    payload = (await response.json()) as TimeSeriesResponse;
  } catch {
    throw new Error(`Twelve Data returned HTTP ${response.status} with an unreadable body`);
  }

  if (!response.ok && payload.status !== 'error') {
    throw new Error(`Twelve Data returned HTTP ${response.status}`);
  }

  return {
    candles: parseTimeSeries(payload),
    symbol: payload.meta?.symbol ?? symbol,
    interval: payload.meta?.interval ?? interval,
  };
}
