// ============================================
// ALPACA MARKET DATA ADAPTER (server-side)
// ============================================
// Endpoint: https://data.alpaca.markets/v2/stocks/bars
//   symbols    a comma-separated list, so ONE request carries every Alpaca asset
//   timeframe  1Min / 5Min / 15Min / 30Min / 1Hour / 4Hour / 1Day
//   feed       pinned to `iex`. The free plan does not allow SIP data for the
//              latest 15 minutes, so SIP would fail exactly when the market is
//              most interesting. IEX is a single exchange, so the volume is
//              PARTIAL market volume — the UI says so and never calls it
//              consolidated volume.
//   limit      the page cap. On a multi-symbol request this is the TOTAL number
//              of bars across all symbols, and the vendor sorts by symbol first,
//              so one page can be a single symbol's bars. Pagination follows
//              `next_page_token` until every symbol has enough bars.
//
// Auth is by the two headers APCA-API-KEY-ID / APCA-API-SECRET-KEY, read from
// ALPACA_API_KEY / ALPACA_API_SECRET. They are read ONLY here, on the server,
// and never reach the browser bundle.
//
// Every request goes through the Alpaca rate meter (api/_lib/alpacaMeter.ts):
// checked before the call and counted after it, with one log line per request.
// There is no path here that reaches Alpaca without the meter.

import type { Candle } from '../../src/core/types.js';
import {
  alpacaMeter,
  markAlpacaExhausted,
  noteAlpacaCall,
  noteAlpacaSuccess,
  recordAlpacaRequest,
  type MeterSnapshot,
} from './alpacaMeter.js';
import { CreditLimitError } from './rateMeter.js';

/** App timeframe -> Alpaca bar timeframe. */
export const ALPACA_TIMEFRAMES: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '1h': '1Hour',
  '4h': '4Hour',
  '1D': '1Day',
};

/**
 * Calendar minutes each bar spans, once the overnight and weekend gaps the US
 * session leaves are included.
 *
 * A 6.5h session holds ~390 one-minute bars but a calendar day holds 1440
 * minutes, so a 1m bar is worth ~4 calendar minutes; a 15m bar ~56; an hourly bar
 * ~206; a daily bar ~2016 (five sessions a week). These constants turn a bar count
 * into a calendar window that actually contains that many bars — which is what
 * makes the vendor's `limit` reachable instead of starving the indicator warmup.
 */
export const ALPACA_CALENDAR_MINUTES_PER_BAR: Record<string, number> = {
  '1m': 4,
  '5m': 19,
  '15m': 56,
  '30m': 111,
  '1h': 206,
  '4h': 886,
  '1D': 2016,
};

/** Headroom over the exact window, so a thin session still yields enough bars. */
const ALPACA_LOOKBACK_SAFETY = 1.5;

/**
 * An explicit `start` for a bars request.
 *
 * Without `start`, Alpaca defaults it to midnight of the current ET day, which
 * would return only today's bars — nowhere near enough for EMA 200 or a 250-bar
 * request. Sizing the window from the bar count is what makes `limit` reachable.
 */
export function alpacaLookbackStart(timeframe: string, bars: number, now: number = Date.now()): string {
  const calendarMinutes = ALPACA_CALENDAR_MINUTES_PER_BAR[timeframe] ?? 26;
  const lookbackMs = Math.max(1, bars) * calendarMinutes * ALPACA_LOOKBACK_SAFETY * 60_000;
  return new Date(now - lookbackMs).toISOString();
}

export type AlpacaErrorKind = 'AUTH' | 'RATE_LIMIT' | 'SYMBOL_NOT_FOUND' | 'SUBSCRIPTION' | 'NETWORK' | 'UPSTREAM';

/** An upstream Alpaca failure with the kind already worked out. */
export class AlpacaError extends Error {
  kind: AlpacaErrorKind;
  status: number;
  /** When a rate limit is in force, ms until it resets. */
  retryAfterMs?: number;

  constructor(kind: AlpacaErrorKind, message: string, status = 0, retryAfterMs?: number) {
    super(message);
    this.name = 'AlpacaError';
    this.kind = kind;
    this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

/** Wording that means "your plan/feed cannot serve this", not a bad key. */
function looksLikeSubscription(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subscription') ||
    lower.includes('not permitted') ||
    lower.includes('not allowed') ||
    lower.includes('feed') ||
    lower.includes('sip') ||
    lower.includes('entitled')
  );
}

function looksLikeSymbolNotFound(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('symbol not found') ||
    lower.includes('invalid symbol') ||
    lower.includes('not found') ||
    lower.includes('unknown symbol') ||
    lower.includes('no asset')
  );
}

function looksLikeRateLimit(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('slow down');
}

/**
 * Classify an Alpaca failure in our own terms.
 *
 * The status code is the primary signal; the message refines a 403, which can
 * mean either "bad credentials" or "this feed is not on your plan".
 */
export function classifyAlpacaError(message: string, status = 0): AlpacaErrorKind {
  if (status === 429 || looksLikeRateLimit(message)) return 'RATE_LIMIT';
  if (looksLikeSubscription(message)) return 'SUBSCRIPTION';
  if (status === 401 || status === 403) return 'AUTH';
  if (looksLikeSymbolNotFound(message)) return 'SYMBOL_NOT_FOUND';
  return 'UPSTREAM';
}

/** Alpaca sends ISO 8601 with a Z or offset; the app stores "YYYY-MM-DD HH:MM:SS" UTC. */
export function normalizeAlpacaTime(iso: string): string {
  const trimmed = iso.trim();
  const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
  if (!Number.isFinite(parsed.getTime())) return trimmed;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${p(parsed.getUTCMonth() + 1)}-${p(parsed.getUTCDate())} ${p(parsed.getUTCHours())}:${p(parsed.getUTCMinutes())}:${p(parsed.getUTCSeconds())}`;
}

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  n?: number;
  vw?: number;
}

export interface AlpacaBarsResponse {
  bars?: Record<string, AlpacaBar[] | null> | null;
  next_page_token?: string | null;
  message?: string;
  code?: number;
}

function num(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Turn one Alpaca bars page into candles per symbol, oldest-first.
 *
 * A bar without a usable close is dropped rather than invented. An absent or
 * empty symbol is a real "no bars here", not an error.
 */
export function parseAlpacaBars(payload: AlpacaBarsResponse): Record<string, Candle[]> {
  const out: Record<string, Candle[]> = {};
  const bars = payload.bars;
  if (!bars || typeof bars !== 'object') return out;

  for (const [symbol, list] of Object.entries(bars)) {
    if (!Array.isArray(list)) continue;
    const candles = list
      .map(bar => ({
        datetime: normalizeAlpacaTime(bar.t),
        open: num(bar.o),
        high: num(bar.h),
        low: num(bar.l),
        close: num(bar.c),
        volume: num(bar.v),
      }))
      .filter(candle => Number.isFinite(candle.close) && candle.close > 0);
    out[symbol] = candles.sort((a, b) => a.datetime.localeCompare(b.datetime));
  }
  return out;
}

/**
 * One server-side line per Alpaca request. Never logs the keys: they travel in
 * headers, which are not echoed here, and the vendor message is scrubbed of
 * anything key-shaped before it is written.
 */
export function logAlpacaRequest(fields: {
  endpoint: string;
  symbols: string[];
  timeframe?: string;
  page?: number;
  pages?: number;
  status: number | string;
  bars?: Record<string, number>;
  meter: MeterSnapshot;
  /** Our own classification, e.g. "AUTH". */
  note?: string;
  /** The vendor's own message, when it sent one. Never a key. */
  message?: string;
}): void {
  const barSummary = fields.bars
    ? Object.entries(fields.bars)
        .map(([symbol, count]) => `${symbol}:${count}`)
        .join(',')
    : null;
  const parts = [
    `[alpaca] ${new Date().toISOString()}`,
    `endpoint=${fields.endpoint}`,
    `symbols=${fields.symbols.join(',')}`,
    fields.timeframe ? `timeframe=${fields.timeframe}` : null,
    fields.page !== undefined ? `page=${fields.page}${fields.pages !== undefined ? `/${fields.pages}` : ''}` : null,
    `status=${fields.status}`,
    barSummary ? `bars=${barSummary}` : null,
    `meterUsed=${fields.meter.used}/${fields.meter.limit}`,
    fields.meter.exhausted ? 'meter=EXHAUSTED' : 'meter=OK',
    fields.note ? `note=${fields.note}` : null,
    fields.message ? `message=${sanitizeLogMessage(fields.message)}` : null,
  ].filter((part): part is string => part !== null);

  console.log(parts.join(' '));
}

/**
 * The vendor's message, made safe for a log line: newlines collapsed to spaces,
 * truncated, and any long key-shaped token redacted. Our keys are never placed in
 * a URL or a message, but a vendor that echoes part of a request must not turn
 * into a leak.
 */
function sanitizeLogMessage(message: string): string {
  return message
    .replace(/\s+/g, ' ')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .slice(0, 300);
}

/** The URL for one page of a multi-symbol bars request. */
export function buildAlpacaBarsUrl(params: {
  symbols: string[];
  timeframe: string;
  limit: number;
  start?: string;
  pageToken?: string | null;
  feed?: string;
  /** 'desc' (the default here) returns the MOST RECENT bars first. */
  sort?: 'asc' | 'desc';
}): string {
  const interval = ALPACA_TIMEFRAMES[params.timeframe] ?? '5Min';
  const search = new URLSearchParams({
    symbols: params.symbols.join(','),
    timeframe: interval,
    limit: String(Math.max(1, Math.min(10_000, params.limit))),
    // IEX explicitly: the free plan cannot read SIP for the latest 15 minutes.
    feed: params.feed ?? 'iex',
    // Newest-first is what makes pagination land on the bars we actually need:
    // the vendor sorts by symbol, so paging a newest-first list walks backwards
    // from the latest bar rather than collecting ancient ones.
    sort: params.sort ?? 'desc',
  });
  if (params.start) search.set('start', params.start);
  if (params.pageToken) search.set('page_token', params.pageToken);
  return `https://data.alpaca.markets/v2/stocks/bars?${search.toString()}`;
}

export interface FetchAlpacaBarsParams {
  symbols: string[];
  timeframe: string;
  /** Bars wanted PER SYMBOL. */
  limit: number;
  keyId: string;
  secretKey: string;
  signal?: AbortSignal;
  /** Safety bound on pages, so a bad token can never loop forever. */
  maxPages?: number;
  /** Base URL override, for tests. */
  baseUrl?: string;
  /** Explicit `start`; defaults to a window sized from the bar count. */
  start?: string;
  /** Clock override, for tests. */
  now?: number;
}

export interface FetchAlpacaBarsResult {
  /** Candles per symbol, oldest-first, each at least `limit` bars when available. */
  candlesBySymbol: Record<string, Candle[]>;
  /** HTTP requests actually made (pagination included). */
  requests: number;
}

const DEFAULT_MAX_PAGES = 12;

/**
 * Fetch bars for every requested symbol in one multi-symbol request, paging
 * through `next_page_token` until each symbol has enough bars.
 *
 * The vendor sorts by symbol then time, so a page can be entirely one symbol's
 * bars; paging is what makes the other symbols reachable. Because `sort=desc`
 * returns the newest bars first, paging walks backwards from the latest bar, and
 * the accumulation keeps only the newest `perSymbol` bars per symbol — so a long
 * history can never crowd out the recent bars a compass needs.
 */
export async function fetchAlpacaBars({
  symbols,
  timeframe,
  limit,
  keyId,
  secretKey,
  signal,
  maxPages = DEFAULT_MAX_PAGES,
  baseUrl,
  start,
  now = Date.now(),
}: FetchAlpacaBarsParams): Promise<FetchAlpacaBarsResult> {
  if (symbols.length === 0) return { candlesBySymbol: {}, requests: 0 };

  const perSymbol = Math.max(1, limit);
  // Size a page to cover every symbol; the vendor applies `limit` to the TOTAL.
  const pageLimit = Math.min(10_000, Math.max(perSymbol, perSymbol * symbols.length));
  const startIso = start ?? alpacaLookbackStart(timeframe, perSymbol, now);

  const accumulated: Record<string, Candle[]> = {};
  for (const symbol of symbols) accumulated[symbol] = [];

  let pageToken: string | null = null;
  let page = 0;
  let requests = 0;

  const enoughForAll = () => symbols.every(symbol => accumulated[symbol].length >= perSymbol);

  while (page < maxPages) {
    page += 1;

    try {
      alpacaMeter.assert(1);
    } catch (error) {
      if (error instanceof CreditLimitError) {
        logAlpacaRequest({
          endpoint: 'stocks_bars',
          symbols,
          timeframe,
          page,
          status: 'BLOCKED',
          meter: alpacaMeter.snapshot(),
          note: error.message,
        });
        throw new AlpacaError('RATE_LIMIT', 'Alpaca rate limit reached', 429, Math.max(0, error.resetAt - Date.now()));
      }
      throw error;
    }

    const url = baseUrl
      ? `${baseUrl}?${new URL(buildAlpacaBarsUrl({ symbols, timeframe, limit: pageLimit, start: startIso, pageToken })).searchParams.toString()}`
      : buildAlpacaBarsUrl({ symbols, timeframe, limit: pageLimit, start: startIso, pageToken });

    let response: Response;
    try {
      noteAlpacaCall();
      response = await fetch(url, {
        signal,
        headers: {
          Accept: 'application/json',
          'APCA-API-KEY-ID': keyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      logAlpacaRequest({
        endpoint: 'stocks_bars',
        symbols,
        timeframe,
        page,
        status: 'NETWORK',
        meter: alpacaMeter.snapshot(),
      });
      throw new AlpacaError('NETWORK', 'Could not reach Alpaca');
    }

    requests += 1;
    const meter = recordAlpacaRequest(
      { endpoint: 'stocks_bars', symbol: symbols.join(','), timeframe, credits: 1 },
      {},
    );

    let payload: AlpacaBarsResponse;
    try {
      payload = (await response.json()) as AlpacaBarsResponse;
    } catch {
      logAlpacaRequest({
        endpoint: 'stocks_bars',
        symbols,
        timeframe,
        page,
        status: response.status,
        meter,
        note: 'unreadable body',
        message: `HTTP ${response.status} returned an unreadable body`,
      });
      throw new AlpacaError('UPSTREAM', `Alpaca returned HTTP ${response.status} with an unreadable body`, response.status);
    }

    if (!response.ok) {
      const message = payload.message ?? `Alpaca returned HTTP ${response.status}`;
      const kind = classifyAlpacaError(message, response.status);
      logAlpacaRequest({
        endpoint: 'stocks_bars',
        symbols,
        timeframe,
        page,
        status: response.status,
        meter,
        note: kind,
        message,
      });
      if (kind === 'RATE_LIMIT') {
        const snapshot = markAlpacaExhausted();
        throw new AlpacaError('RATE_LIMIT', 'Alpaca rate limit reached', response.status, Math.max(0, snapshot.resetAt - Date.now()));
      }
      throw new AlpacaError(kind, message, response.status);
    }

    const pageBars = parseAlpacaBars(payload);
    const counts: Record<string, number> = {};
    let pageHadBars = false;
    for (const symbol of symbols) {
      const list = pageBars[symbol];
      if (list && list.length > 0) {
        accumulated[symbol] = mergeCandles(accumulated[symbol], list, perSymbol);
        pageHadBars = true;
      }
      counts[symbol] = accumulated[symbol].length;
    }

    // A page with at least one real bar is a successful call; a page that is
    // empty for every symbol is a real "no bars here", not a failure, so it is
    // NOT recorded as success.
    if (pageHadBars) noteAlpacaSuccess();

    logAlpacaRequest({
      endpoint: 'stocks_bars',
      symbols,
      timeframe,
      page,
      status: response.status,
      bars: counts,
      meter,
    });

    const token = payload.next_page_token ?? null;
    if (!token) break;
    if (enoughForAll()) break;
    pageToken = token;
  }

  return { candlesBySymbol: accumulated, requests };
}

/**
 * Merge two candle lists and keep the newest `keep` bars, oldest-first.
 *
 * A page may repeat a bar already seen, so merging de-duplicates by open time.
 * Trimming to the newest `keep` is what keeps a paged history from pushing the
 * recent bars out of the series the indicators are computed from.
 */
function mergeCandles(existing: Candle[], incoming: Candle[], keep: number): Candle[] {
  const byTime = new Map<string, Candle>();
  for (const candle of existing) byTime.set(candle.datetime, candle);
  for (const candle of incoming) byTime.set(candle.datetime, candle);
  const merged = [...byTime.values()].sort((a, b) => a.datetime.localeCompare(b.datetime));
  return merged.length > keep ? merged.slice(merged.length - keep) : merged;
}
