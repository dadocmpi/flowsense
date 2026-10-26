// ============================================
// TWELVE DATA PROVIDER — SERVER-PROXIED
// ============================================
// Gold, S&P 500 and Dow need an API key, and an API key must never reach the
// browser. So this provider does not call Twelve Data directly: it calls this
// app's own serverless routes, which hold the key in a Vercel environment
// variable and forward the request.
//
//   /api/futures/candles   real OHLCV, symbol-resolved and briefly cached
//   /api/futures/status    whether a key is configured, and what is resolved
//   /api/futures/stream    WebSocket relay (only when the key may reach a socket)
//
// ALL indicators are computed locally from these candles. The vendor's own
// indicator endpoints are never used, which keeps the credit spend at one call
// per symbol/timeframe rather than one per indicator.
//
// Capabilities are declared honestly:
//   candles   yes
//   ticks     yes, but only through a live feed the server is willing to expose;
//             otherwise the feed polls REST and the UI shows a "polling" badge
//
// The provider reports WHICH symbol answered and whether it is a proxy. A proxy
// is never presented as the futures contract.
//
// KEY HANDLING: Twelve Data's price WebSocket authenticates with the API key in
// the URL. A browser connecting to it directly would therefore expose the key,
// which is not acceptable. So the live path here is REST polling by default; a
// WebSocket is only attempted when the server explicitly says a browser-safe
// relay is available (see `websocket` in the status route).

import type { Candle, Timeframe } from '../types';
import type { Instrument, ResolvedSource } from '../instruments';
import { normalizeSeries } from '../candles';
import { ProviderError, type MarketDataProvider, type Subscription, type TickHandlers } from './types';
import { PRICE_POLL_INTERVAL_MS } from './polling';
import { isEntitlementFailure, parseWsMessage } from './twelvedataWs';

export interface FuturesRouteResponse {
  ok: boolean;
  candles?: Candle[];
  /** Where the numbers actually came from, for the UI's provenance line. */
  source?: string;
  /** The symbol the vendor echoed back. */
  symbol?: string;
  interval?: string;
  /** 'futures' when the real contract answered, 'proxy' when it did not. */
  symbolKind?: 'futures' | 'proxy';
  symbolLabel?: string;
  isProxy?: boolean;
  requestedSymbol?: string;
  instrumentType?: string;
  exchange?: string;
  cached?: boolean;
  error?: { kind: string; message: string };
}

const ERROR_KINDS = new Set([
  'NOT_CONFIGURED',
  'UNSUPPORTED_INSTRUMENT',
  'GEO_BLOCKED',
  'RATE_LIMIT',
  'SYMBOL_NOT_FOUND',
  'NETWORK',
  'UPSTREAM',
  'UNKNOWN',
]);

function toProviderError(kind: string | undefined, message: string, status: number): ProviderError {
  const normalized = kind && ERROR_KINDS.has(kind) ? (kind as ProviderError['kind']) : 'UNKNOWN';
  return new ProviderError(normalized, message, status);
}

/**
 * Whether the futures source is configured is a server-side fact, so the client
 * asks the route once and caches the answer. Until it knows, the UI shows the
 * instrument as "checking", never as if it had data.
 */
let configuredCache: boolean | null = null;
/** Whether the server offers a browser-safe live feed. */
let liveStreamCache: boolean | null = null;
/** The resolved symbol per instrument, as last reported by the server. */
const resolvedCache = new Map<string, ResolvedSource>();

export function setFuturesConfigured(value: boolean | null): void {
  configuredCache = value;
}

/** True when the server says a browser-safe live feed is available. */
export function futuresLiveStreamEnabled(): boolean {
  return liveStreamCache === true;
}

export function resolvedSourceFor(instrumentId: string): ResolvedSource | undefined {
  return resolvedCache.get(instrumentId);
}

export function clearFuturesCaches(): void {
  configuredCache = null;
  liveStreamCache = null;
  resolvedCache.clear();
}

/** Record provenance from a candles response, for the UI to render. */
function rememberResolution(instrumentId: string, payload: FuturesRouteResponse): void {
  if (!payload.symbol || !payload.symbolKind) return;
  resolvedCache.set(instrumentId, {
    symbol: payload.requestedSymbol ?? payload.symbol,
    vendorSymbol: payload.symbol,
    kind: payload.symbolKind,
    description: payload.symbolLabel ?? payload.symbol,
    instrumentType: payload.instrumentType,
    exchange: payload.exchange,
  });
}

export const futuresProvider: MarketDataProvider = {
  id: 'futures',
  label: 'Twelve Data (server-proxied)',
  capabilities: { candles: true, ticks: true },

  isConfigured: () => configuredCache === true,

  async getCandles(instrument, timeframe, limit, signal) {
    const params = new URLSearchParams({
      instrument: instrument.id,
      timeframe,
      limit: String(limit),
    });

    let response: Response;
    try {
      response = await fetch(`/api/futures/candles?${params.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ProviderError('NETWORK', 'Could not reach the futures data route');
    }

    let payload: FuturesRouteResponse;
    try {
      payload = (await response.json()) as FuturesRouteResponse;
    } catch {
      throw new ProviderError('UPSTREAM', `Futures route returned HTTP ${response.status}`);
    }

    if (payload.ok === false) {
      if (payload.error?.kind === 'NOT_CONFIGURED') setFuturesConfigured(false);
      throw toProviderError(payload.error?.kind, payload.error?.message ?? 'Futures request failed', response.status);
    }

    if (!Array.isArray(payload.candles)) {
      throw new ProviderError('UPSTREAM', 'Futures route returned no candle array');
    }

    setFuturesConfigured(true);
    rememberResolution(instrument.id, payload);
    return normalizeSeries(payload.candles);
  },

  /**
   * The live feed.
   *
   * When the server offers a browser-safe stream, the price socket is used and
   * the status can reach LIVE. Otherwise this falls back to REST polling, which
   * reports OFFLINE so the UI shows a "polling" badge — a polled close is not a
   * live tick and must never be dressed as one.
   */
  subscribeTicks(instrument, handlers) {
    if (liveStreamCache === true) return openPriceStream(instrument, handlers);
    return pollCandles(instrument, '1m', handlers);
  },
};

/** Ask the route whether the server has a key configured, and what it resolved. */
export interface FuturesProbeResult {
  configured: boolean;
  /**
   * False when the status route could not be reached at all. This is NOT the
   * same as "no key configured", and the UI must not say so: a dev server
   * without the api/ functions, or a network blip, is not a missing key.
   */
  reachable: boolean;
  note?: string;
}

export async function probeFuturesProvider(signal?: AbortSignal): Promise<FuturesProbeResult> {
  try {
    const response = await fetch('/api/futures/status', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      setFuturesConfigured(false);
      return { configured: false, reachable: false, note: `Status route returned HTTP ${response.status}` };
    }
    const payload = (await response.json()) as {
      configured?: boolean;
      provider?: string;
      note?: string;
      websocket?: boolean;
      instruments?: Array<{ instrumentId: string; resolved: ResolvedSource | null }>;
    };
    const configured = payload.configured === true;
    setFuturesConfigured(configured);
    liveStreamCache = payload.websocket === true;
    // Prefer a server-known resolution, but never overwrite one we learned from
    // a real candles response.
    for (const entry of payload.instruments ?? []) {
      if (entry.resolved && !resolvedCache.has(entry.instrumentId)) {
        resolvedCache.set(entry.instrumentId, entry.resolved);
      }
    }
    return { configured, reachable: true, note: payload.note };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    setFuturesConfigured(false);
    return { configured: false, reachable: false, note: 'Could not reach the futures status route' };
  }
}

// ============================================
// REST POLLING
// ============================================

export interface PollHandlers extends TickHandlers {
  /** Called with the newest bar so the hook can patch the last candle. */
  onCandle?: (timeframe: Timeframe, candle: Candle) => void;
}

/**
 * Poll the candles route on a cadence tied to the timeframe.
 *
 * The status is reported as UNAVAILABLE, which the UI renders as a delayed /
 * polling badge — a polled close is not a live tick and must not be dressed as
 * one.
 */
export function pollCandles(instrument: Instrument, timeframe: Timeframe, handlers: PollHandlers): Subscription {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Declare the feed as unavailable up front: there is no live socket, so the
  // UI must show a delayed/polling badge rather than a live dot.
  handlers.onStatus?.('UNAVAILABLE');

  const tick = async () => {
    if (closed) return;
    try {
      const params = new URLSearchParams({ instrument: instrument.id, timeframe, limit: '2' });
      const response = await fetch(`/api/futures/candles?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as FuturesRouteResponse;
      if (closed) return;
      if (payload.ok && Array.isArray(payload.candles) && payload.candles.length > 0) {
        const latest = payload.candles[payload.candles.length - 1];
        handlers.onCandle?.(timeframe, latest);
        handlers.onTick({ instrumentId: instrument.id, price: latest.close, timestamp: Date.now() });
        rememberResolution(instrument.id, payload);
      }
    } catch {
      // A failed poll is not fatal: the next one may succeed, and the hook
      // keeps showing the last real bar with its real timestamp.
    }
    if (!closed) timer = setTimeout(tick, PRICE_POLL_INTERVAL_MS);
  };

  timer = setTimeout(tick, PRICE_POLL_INTERVAL_MS);

  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  };
}

// ============================================
// PRICE WEBSOCKET (browser-safe relay only)
// ============================================

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];

function openPriceStream(instrument: Instrument, handlers: TickHandlers): Subscription {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let giveUp = false;

  const symbol = resolvedCache.get(instrument.id)?.symbol ?? instrument.providerSymbol;

  const connect = () => {
    if (closed || giveUp) return;
    handlers.onStatus?.(attempt === 0 ? 'CONNECTING' : 'RECONNECTING');

    // No key in the URL: this is our own relay, which holds the vendor key.
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/futures/stream?symbol=${encodeURIComponent(symbol)}`;

    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempt = 0;
      handlers.onStatus?.('LIVE');
    };

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;
      const parsed = parseWsMessage(event.data);
      if (parsed.kind === 'PRICE') {
        handlers.onTick({
          instrumentId: instrument.id,
          price: parsed.message.price,
          timestamp: parsed.message.timestamp,
        });
        return;
      }
      if (parsed.kind === 'STATUS' && !parsed.ok && isEntitlementFailure(parsed.detail)) {
        giveUp = true;
        handlers.onStatus?.('UNAVAILABLE');
        socket?.close();
      }
    };

    socket.onclose = () => {
      socket = null;
      if (closed || giveUp) return;
      handlers.onStatus?.('RECONNECTING');
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed || giveUp) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  };
}
