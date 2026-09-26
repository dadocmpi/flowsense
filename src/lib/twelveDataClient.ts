// ============================================
// TWELVE DATA CLIENT
// ============================================
// All requests go through the server-side proxy at /api/twelvedata so the API
// key is never exposed to the browser.

import type { Candle } from './indicators';

export type TwelveDataErrorKind =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'PLAN_LIMIT'
  | 'RATE_LIMIT'
  | 'SYMBOL_NOT_FOUND'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'UNKNOWN';

export class TwelveDataError extends Error {
  kind: TwelveDataErrorKind;
  status: number;

  constructor(kind: TwelveDataErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'TwelveDataError';
    this.kind = kind;
    this.status = status;
  }
}

export interface TimeSeriesResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
  meta: Record<string, unknown>;
}

export interface QuoteResponse {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  previousClose: number;
  change: number;
  percentChange: number;
  averageVolume: number;
  isMarketOpen: boolean;
}

interface RequestOptions {
  signal?: AbortSignal;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function request(params: Record<string, string>, options: RequestOptions = {}): Promise<unknown> {
  const query = new URLSearchParams(params);
  let response: Response;

  try {
    response = await fetch(`/api/twelvedata?${query.toString()}`, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new TwelveDataError('NETWORK', 'Could not reach the data proxy', 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TwelveDataError('UPSTREAM', 'The data proxy returned an invalid response', response.status);
  }

  if (response.ok) return payload;

  const record = (payload ?? {}) as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message : 'Data request failed';
  const code = typeof record.code === 'string' ? record.code : '';

  if (code === 'MISSING_API_KEY') throw new TwelveDataError('MISSING_API_KEY', message, response.status);
  if (response.status === 429) throw new TwelveDataError('RATE_LIMIT', message, response.status);
  if (response.status === 401) throw new TwelveDataError('INVALID_API_KEY', message, response.status);
  if (response.status === 403) throw new TwelveDataError('PLAN_LIMIT', message, response.status);
  if (response.status === 404 || /not found|invalid symbol/i.test(message)) {
    throw new TwelveDataError('SYMBOL_NOT_FOUND', message, response.status);
  }
  throw new TwelveDataError('UPSTREAM', message, response.status);
}

function parseCandles(payload: Record<string, unknown>): Candle[] {
  const values = payload.values;
  if (!Array.isArray(values)) return [];

  const candles: Candle[] = [];
  for (const entry of values) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const datetime = typeof row.datetime === 'string' ? row.datetime : '';
    if (!datetime) continue;

    candles.push({
      datetime,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume, 0),
    });
  }

  // Twelve Data returns newest-first by default; indicators need oldest-first.
  return candles.reverse();
}

export async function fetchTimeSeries(
  symbol: string,
  interval: string,
  outputsize: number,
  options: RequestOptions = {}
): Promise<TimeSeriesResponse> {
  const payload = (await request(
    {
      endpoint: 'time_series',
      symbol,
      interval,
      outputsize: String(outputsize),
      order: 'asc',
    },
    options
  )) as Record<string, unknown>;

  const candles = parseCandles(payload);
  if (candles.length === 0) {
    throw new TwelveDataError('SYMBOL_NOT_FOUND', `No candles returned for ${symbol} @ ${interval}`, 200);
  }

  const meta = (typeof payload.meta === 'object' && payload.meta !== null ? payload.meta : {}) as Record<string, unknown>;

  return {
    symbol: typeof meta.symbol === 'string' ? meta.symbol : symbol,
    interval: typeof meta.interval === 'string' ? meta.interval : interval,
    candles,
    meta,
  };
}

export async function fetchQuote(symbol: string, options: RequestOptions = {}): Promise<QuoteResponse> {
  const payload = (await request({ endpoint: 'quote', symbol }, options)) as Record<string, unknown>;

  return {
    symbol: typeof payload.symbol === 'string' ? payload.symbol : symbol,
    name: typeof payload.name === 'string' ? payload.name : symbol,
    exchange: typeof payload.exchange === 'string' ? payload.exchange : '',
    currency: typeof payload.currency === 'string' ? payload.currency : '',
    datetime: typeof payload.datetime === 'string' ? payload.datetime : '',
    open: toNumber(payload.open),
    high: toNumber(payload.high),
    low: toNumber(payload.low),
    close: toNumber(payload.close),
    previousClose: toNumber(payload.previous_close),
    change: toNumber(payload.change),
    percentChange: toNumber(payload.percent_change),
    averageVolume: toNumber(payload.average_volume),
    isMarketOpen: Boolean(payload.is_market_open),
  };
}
