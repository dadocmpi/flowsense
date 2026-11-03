// ============================================
// SERVER-PROXIED MARKET DATA PROVIDER (client)
// ============================================
// The assets need vendor keys, and a key must never reach the browser. So this
// provider does not call a vendor directly: it calls this app's own serverless
// routes, which hold the keys in Vercel environment variables and forward the
// request. WHICH vendor serves an asset (Twelve Data for Gold, Alpaca for the
// index assets) is a server-side configuration fact — this client asks for an
// instrument and is told which provider answered.
//
//   /api/futures/candles   real OHLCV, per-asset provider, briefly cached
//   /api/futures/status    whether a provider is configured, and what is resolved
//   /api/health            provider credential + call-rate report
//
// ALL indicators are computed locally from these candles. The vendor's own
// indicator endpoints are never used, which keeps the spend at one call per
// symbol/timeframe rather than one per indicator.
//
// The provider reports WHICH symbol answered and whether it is a proxy. An index
// asset read through an ETF is never presented as the index itself.
//
// KEY HANDLING: no vendor key is ever put in a URL. The live path is REST
// polling; a WebSocket relay is only used when the server says one is available.

import type { Candle, Timeframe } from '../types';
import type { Instrument, ProviderId, ResolvedSource } from '../instruments';
import { normalizeSeries } from '../candles';
import { ProviderError, type MarketDataProvider, type Subscription, type TickHandlers } from './types';
import { PRICE_POLL_INTERVAL_MS, pollIntervalForProvider } from './polling';
import { isConfigurationFailure, isEntitlementFailure, parseWsMessage } from './twelvedataWs';

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
  /** Which provider served this payload, e.g. "alpaca". */
  provider?: ProviderId;
  /** The feed, e.g. "iex". Alpaca only. */
  feed?: string;
  /** True when the volume is a single exchange's, not consolidated. */
  partialVolume?: boolean;
  cached?: boolean;
  error?: { kind: string; message: string; retryAfterMs?: number };
}

/** A batch candles response: one payload per asset id, all on one provider. */
export interface FuturesBatchResponse {
  ok: boolean;
  provider?: ProviderId;
  timeframe?: string;
  assets?: Record<string, FuturesRouteResponse>;
}

/** A provider's rate-meter state the status route reports. */
export interface ProviderMeterState {
  limit: number;
  used: number;
  remaining: number;
  resetAt: number;
  exhausted: boolean;
  coldStart: boolean;
  reason: string | null;
}

/** The status route's per-provider block. */
export interface ProviderStatusState {
  configured: boolean;
  credits?: ProviderMeterState;
  requests?: ProviderMeterState;
}

/** The credit/request meter state the status route reports, for the UI. */
export interface CreditState extends ProviderMeterState {}

const ERROR_KINDS = new Set([
  'NOT_CONFIGURED',
  'UNSUPPORTED_INSTRUMENT',
  'GEO_BLOCKED',
  'RATE_LIMIT',
  'SYMBOL_NOT_FOUND',
  'NETWORK',
  'UPSTREAM',
  'AUTH',
  'SUBSCRIPTION',
  'UNKNOWN',
]);

function toProviderError(
  kind: string | undefined,
  message: string,
  status: number,
  retryAfterMs?: number
): ProviderError {
  const normalized = kind && ERROR_KINDS.has(kind) ? (kind as ProviderError['kind']) : 'UNKNOWN';
  return new ProviderError(normalized, message, status, retryAfterMs);
}

/**
 * Whether each provider is configured is a server-side fact, so the client asks
 * the route once and caches the answer. Until it knows, the UI shows the
 * instrument as "checking", never as if it had data.
 */
let configuredCache: boolean | null = null;
/** Whether the server offers a browser-safe live feed. */
let liveStreamCache: boolean | null = null;
/** The resolved symbol per instrument, as last reported by the server. */
const resolvedCache = new Map<string, ResolvedSource>();
/** The provider per instrument, as last reported by the server. */
const providerCache = new Map<string, ProviderId>();
/** The last Twelve Data meter state the server reported. */
let creditCache: CreditState | null = null;
/** The last Alpaca meter state the server reported. */
let alpacaCreditCache: CreditState | null = null;
/** The in-flight status probe, so two callers share one request. */
let statusProbe: Promise<FuturesProbeResult> | null = null;

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

/** The provider the server last reported serving this instrument, if known. */
export function providerForResolved(instrumentId: string): ProviderId | undefined {
  return providerCache.get(instrumentId);
}

/** The last Twelve Data meter state, for the UI's rate-limit banner. */
export function futuresCreditState(): CreditState | null {
  return creditCache;
}

/** The last Alpaca meter state, for the UI's rate-limit banner. */
export function alpacaCreditState(): CreditState | null {
  return alpacaCreditCache;
}

/** Which vendors the server reports as configured, per the last status probe. */
let providerConfigured: Record<'twelvedata' | 'alpaca', boolean> | null = null;

export function providerConfiguredState(): Record<'twelvedata' | 'alpaca', boolean> | null {
  return providerConfigured;
}

/** The meter state for whichever provider serves this instrument. */
export function creditStateFor(instrumentId: string): CreditState | null {
  return providerCache.get(instrumentId) === 'alpaca' ? alpacaCreditCache : creditCache;
}

export function clearFuturesCaches(): void {
  configuredCache = null;
  liveStreamCache = null;
  creditCache = null;
  alpacaCreditCache = null;
  providerConfigured = null;
  statusProbe = null;
  resolvedCache.clear();
  providerCache.clear();
}

/** Record provenance from a candles response, for the UI to render. */
function rememberResolution(instrumentId: string, payload: FuturesRouteResponse): void {
  if (payload.provider) providerCache.set(instrumentId, payload.provider);
  if (!payload.symbol || !payload.symbolKind) return;
  resolvedCache.set(instrumentId, {
    symbol: payload.requestedSymbol ?? payload.symbol,
    vendorSymbol: payload.symbol,
    kind: payload.symbolKind,
    description: payload.symbolLabel ?? payload.symbol,
    instrumentType: payload.instrumentType,
    exchange: payload.exchange,
    provider: payload.provider,
    feed: payload.feed,
    partialVolume: payload.partialVolume,
  });
}

export const futuresProvider: MarketDataProvider = {
  id: 'futures',
  serves: ['twelvedata', 'alpaca'],
  label: 'Server-proxied (Twelve Data + Alpaca)',
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
      throw toProviderError(
        payload.error?.kind,
        payload.error?.message ?? 'Futures request failed',
        response.status,
        payload.error?.retryAfterMs
      );
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

// ============================================
// BATCH LOAD (all assets on one provider, one request)
// ============================================

export interface BatchLoadResult {
  /** Per instrument id: the candles, or an error. One failure never blocks another. */
  byInstrument: Record<string, { candles: Candle[] } | { error: ProviderError }>;
}

/**
 * Load every Alpaca-backed asset for one timeframe in ONE vendor request.
 *
 * This is what makes "load everything on open" cheap: seven timeframes are
 * seven requests for all Alpaca assets, not one request per asset per timeframe.
 * The result is keyed per asset so one bad symbol cannot block the others.
 */
export async function loadAlpacaBatch(
  timeframe: Timeframe,
  limit: number,
  signal?: AbortSignal
): Promise<BatchLoadResult> {
  const params = new URLSearchParams({ assets: '1', timeframe, limit: String(limit) });
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

  let payload: FuturesBatchResponse;
  try {
    payload = (await response.json()) as FuturesBatchResponse;
  } catch {
    throw new ProviderError('UPSTREAM', `Futures route returned HTTP ${response.status}`);
  }

  const byInstrument: BatchLoadResult['byInstrument'] = {};
  for (const [instrumentId, entry] of Object.entries(payload.assets ?? {})) {
    if (entry.ok && Array.isArray(entry.candles)) {
      byInstrument[instrumentId] = { candles: normalizeSeries(entry.candles) };
      rememberResolution(instrumentId, entry);
    } else {
      byInstrument[instrumentId] = {
        error: toProviderError(
          entry.error?.kind,
          entry.error?.message ?? 'Futures request failed',
          response.status,
          entry.error?.retryAfterMs
        ),
      };
    }
  }
  if (Object.keys(byInstrument).length > 0) setFuturesConfigured(true);
  return { byInstrument };
}

/** Ask the route whether the server has keys configured, and what it resolved. */
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

/**
 * Ask the route whether the server has a key configured, and what it resolved.
 *
 * Concurrent callers share ONE in-flight request: the page mounts the feed hook
 * and the selector, both of which need this answer, and two identical calls to
 * our own status route is waste. The status route itself costs no vendor calls,
 * but there is no reason to make it twice.
 *
 * The shared request deliberately ignores the caller's AbortSignal: with two
 * callers on one promise, letting either abort would reject the other's answer.
 * A caller that unmounts ignores the result itself.
 */
export function probeFuturesProvider(_signal?: AbortSignal): Promise<FuturesProbeResult> {
  if (statusProbe) return statusProbe;
  const probe = runStatusProbe().finally(() => {
    statusProbe = null;
  });
  statusProbe = probe;
  return probe;
}

async function runStatusProbe(): Promise<FuturesProbeResult> {
  try {
    const response = await fetch('/api/futures/status', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      setFuturesConfigured(false);
      return { configured: false, reachable: false, note: `Status route returned HTTP ${response.status}` };
    }
    const payload = (await response.json()) as {
      configured?: boolean;
      provider?: string;
      note?: string;
      websocket?: boolean;
      providers?: { twelvedata?: ProviderStatusState; alpaca?: ProviderStatusState };
      credits?: CreditState;
      instruments?: Array<{ instrumentId: string; provider?: ProviderId; resolved: ResolvedSource | null }>;
    };
    const configured = payload.configured === true;
    setFuturesConfigured(configured);
    liveStreamCache = payload.websocket === true;
    if (payload.providers) {
      providerConfigured = {
        twelvedata: payload.providers.twelvedata?.configured === true,
        alpaca: payload.providers.alpaca?.configured === true,
      };
    }
    // Prefer the per-provider meters; fall back to the legacy top-level block.
    if (payload.providers?.twelvedata?.credits) creditCache = payload.providers.twelvedata.credits;
    else if (payload.credits) creditCache = payload.credits;
    if (payload.providers?.alpaca?.requests) alpacaCreditCache = payload.providers.alpaca.requests;
    // Prefer a server-known resolution, but never overwrite one we learned from
    // a real candles response.
    for (const entry of payload.instruments ?? []) {
      if (entry.provider) providerCache.set(entry.instrumentId, entry.provider);
      if (entry.resolved && !resolvedCache.has(entry.instrumentId)) {
        resolvedCache.set(entry.instrumentId, { ...entry.resolved, provider: entry.resolved.provider ?? entry.provider });
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

  // The cadence is the PROVIDER's, not a single global one: the two vendors are
  // metered differently, so their refresh rates differ.
  const cadenceMs = pollIntervalForProvider(instrument.providerId, timeframe);

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
        handlers.onStatus?.('UNAVAILABLE');
      } else if (payload.error?.kind === 'RATE_LIMIT') {
        // The meter blocked the poll. Do not retry in a loop: the server will
        // refuse every call until the minute resets, so report the state and wait
        // out the reset before the next attempt.
        handlers.onStatus?.('RATE_LIMITED');
        const delay = Math.max(payload.error.retryAfterMs ?? 0, PRICE_POLL_INTERVAL_MS);
        if (!closed) timer = setTimeout(tick, delay);
        return;
      }
    } catch {
      // A failed poll is not fatal: the next one may succeed, and the hook
      // keeps showing the last real bar with its real timestamp.
    }
    if (!closed) timer = setTimeout(tick, cadenceMs);
  };

  timer = setTimeout(tick, cadenceMs);

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
      if (parsed.kind === 'STATUS' && !parsed.ok && (isEntitlementFailure(parsed.detail) || isConfigurationFailure(parsed.detail))) {
        // Either the plan has no WebSocket access or the server has no key: both
        // are permanent, so stop reconnecting rather than hammering the relay.
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
