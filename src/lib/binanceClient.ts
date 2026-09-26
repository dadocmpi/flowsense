// ============================================
// BINANCE CLIENT — PUBLIC MARKET DATA
// ============================================
// Binance's public market-data endpoints need no API key and answer with
// `access-control-allow-origin: *`, so the browser talks to them directly.
// Nothing here is authenticated — no key, no secret, no proxy needed.
//
// Binance runs regional domains and blocks some of them from some locations
// (HTTP 451). We try the official hosts in order and remember whichever
// answers, so a geo-block on one domain is not fatal.

import type { Candle } from './indicators';

const REST_HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api.binance.us',
];

const WS_HOSTS = [
  'wss://data-stream.binance.vision',
  'wss://stream.binance.com:9443',
  'wss://stream.binance.us:9443',
];

let preferredRestHost: string | null = null;
let preferredWsHost: string | null = null;

export type BinanceErrorKind =
  | 'GEO_BLOCKED'
  | 'RATE_LIMIT'
  | 'SYMBOL_NOT_FOUND'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'UNKNOWN';

export class BinanceError extends Error {
  kind: BinanceErrorKind;
  status: number;

  constructor(kind: BinanceErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'BinanceError';
    this.kind = kind;
    this.status = status;
  }
}

/** App timeframe -> Binance interval. They happen to share the same names. */
export const BINANCE_INTERVALS: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

function formatUtc(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  // "YYYY-MM-DD HH:MM:SS" (UTC), the format the shared candle aggregation and
  // range code expects.
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hostsInOrder(preferred: string | null, all: string[]): string[] {
  if (!preferred || !all.includes(preferred)) return all;
  return [preferred, ...all.filter(h => h !== preferred)];
}

async function restGet(path: string, signal?: AbortSignal): Promise<unknown> {
  const hosts = hostsInOrder(preferredRestHost, REST_HOSTS);
  let lastError: BinanceError | null = null;

  for (const host of hosts) {
    try {
      const response = await fetch(`${host}${path}`, { signal, headers: { Accept: 'application/json' } });

      if (response.status === 451) {
        lastError = new BinanceError('GEO_BLOCKED', `Binance is not available from this location (${host})`, 451);
        continue;
      }
      if (response.status === 429 || response.status === 418) {
        throw new BinanceError('RATE_LIMIT', 'Binance rate limit reached. Slowing down.', response.status);
      }
      if (response.status === 400 || response.status === 404) {
        throw new BinanceError('SYMBOL_NOT_FOUND', `Binance rejected the request for ${path}`, response.status);
      }
      if (!response.ok) {
        lastError = new BinanceError('UPSTREAM', `Binance returned HTTP ${response.status}`, response.status);
        continue;
      }

      preferredRestHost = host;
      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof BinanceError && error.kind === 'RATE_LIMIT') throw error;
      if (error instanceof BinanceError && error.kind === 'SYMBOL_NOT_FOUND') throw error;
      lastError = error instanceof BinanceError ? error : new BinanceError('NETWORK', `Could not reach ${host}`, 0);
    }
  }

  throw lastError ?? new BinanceError('NETWORK', 'Could not reach any Binance host', 0);
}

/**
 * Real klines. Binance also reports the taker-buy base volume per candle
 * (index 9), which is genuine aggressor flow — it lets us split each candle's
 * volume into buy-initiated and sell-initiated without inventing anything.
 */
export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 300,
  signal?: AbortSignal
): Promise<Candle[]> {
  const binanceInterval = BINANCE_INTERVALS[interval] ?? '5m';
  const capped = Math.max(1, Math.min(1000, limit));
  const payload = await restGet(
    `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${binanceInterval}&limit=${capped}`,
    signal
  );

  if (!Array.isArray(payload)) {
    throw new BinanceError('UPSTREAM', `Unexpected kline payload for ${symbol}`, 200);
  }

  const candles: Candle[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const openTime = toNumber(row[0], NaN);
    if (!Number.isFinite(openTime)) continue;

    const volume = toNumber(row[5], 0);
    const takerBuyVolume = row.length > 9 ? toNumber(row[9], 0) : 0;

    candles.push({
      datetime: formatUtc(openTime),
      open: toNumber(row[1]),
      high: toNumber(row[2]),
      low: toNumber(row[3]),
      close: toNumber(row[4]),
      volume,
      takerBuyVolume: Math.min(takerBuyVolume, volume),
    });
  }

  // Binance returns oldest-first, but sort defensively.
  candles.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return candles;
}

export interface BinanceTicker {
  symbol: string;
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  quoteVolume: number;
  trades: number;
}

export async function fetch24hTicker(symbol: string, signal?: AbortSignal): Promise<BinanceTicker> {
  const payload = (await restGet(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, signal)) as Record<
    string,
    unknown
  >;

  if (!payload || typeof payload !== 'object') {
    throw new BinanceError('UPSTREAM', `Unexpected ticker payload for ${symbol}`, 200);
  }

  return {
    symbol: typeof payload.symbol === 'string' ? payload.symbol : symbol,
    price: toNumber(payload.lastPrice),
    change: toNumber(payload.priceChange),
    percentChange: toNumber(payload.priceChangePercent),
    high: toNumber(payload.highPrice),
    low: toNumber(payload.lowPrice),
    open: toNumber(payload.openPrice),
    previousClose: toNumber(payload.prevClosePrice),
    volume: toNumber(payload.volume),
    quoteVolume: toNumber(payload.quoteVolume),
    trades: toNumber(payload.count),
  };
}

// ============================================
// LIVE STREAMS
// ============================================

export interface StreamHandlers {
  onTicker?: (payload: Record<string, unknown>) => void;
  onDepth?: (payload: Record<string, unknown>) => void;
  onAggTrade?: (payload: Record<string, unknown>) => void;
  onStatus?: (status: 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE', host?: string) => void;
}

export interface StreamHandle {
  close: () => void;
}

/**
 * Opens the combined public stream (ticker + partial book depth + aggTrade),
 * falling back across hosts and reconnecting with capped backoff. Returns a
 * handle whose close() tears everything down.
 */
export function openMarketStream(binanceSymbol: string, handlers: StreamHandlers): StreamHandle {
  const lower = binanceSymbol.toLowerCase();
  const streams = [`${lower}@ticker`, `${lower}@depth10@100ms`, `${lower}@aggTrade`].join('/');

  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;

    const hosts = hostsInOrder(preferredWsHost, WS_HOSTS);
    const host = hosts[attempt % hosts.length];

    handlers.onStatus?.(attempt === 0 ? 'CONNECTING' : 'RECONNECTING', host);

    try {
      ws = new WebSocket(`${host}/stream?streams=${streams}`);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      preferredWsHost = host;
      attempt = 0;
      handlers.onStatus?.('LIVE', host);
    };

    ws.onmessage = event => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (typeof parsed !== 'object' || parsed === null) return;

      const envelope = parsed as Record<string, unknown>;
      const data = (envelope.data ?? envelope) as Record<string, unknown>;

      // Partial book depth has no event type, only bids/asks.
      if (Array.isArray(data.bids) && Array.isArray(data.asks)) {
        handlers.onDepth?.(data);
        return;
      }

      const eventType = typeof data.e === 'string' ? data.e : '';
      if (eventType === '24hrTicker') handlers.onTicker?.(data);
      else if (eventType === 'aggTrade') handlers.onAggTrade?.(data);
    };

    ws.onerror = () => {
      // onclose fires next; nothing to do here.
    };

    ws.onclose = () => {
      if (closed) return;
      handlers.onStatus?.('RECONNECTING', host);
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    attempt += 1;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      }
      handlers.onStatus?.('OFFLINE');
    },
  };
}
