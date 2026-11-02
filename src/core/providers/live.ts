// ============================================
// LIVE QUOTE PROVIDER
// ============================================
// The near-real-time price seam. The Summary price and the M1 reading of the
// selected asset refresh on this cadence, within the credit budget.
//
// This module deliberately defines an INTERFACE plus exactly ONE adapter: a
// REST poller. It does NOT open a WebSocket. A price socket needs an always-on
// server and a Pro plan, neither of which this app has, so a streaming adapter
// is left for later — it would implement `LiveQuoteProvider` and register here,
// and nothing else in the app would change.
//
// The poller is honest about what it is: a polled close is not a tick, so a
// quote carries the time it was read and the UI shows the data age rather than
// dressing it as live.

import type { Candle, Timeframe } from '../types';

/** One price reading, with the moment it was read. */
export interface LiveQuote {
  instrumentId: string;
  price: number;
  /** Epoch ms the quote was read (or the vendor's own stamp, when it has one). */
  timestamp: number;
  /** How the quote was obtained, so the UI never calls a poll a tick. */
  mode: 'POLL' | 'STREAM';
  /**
   * The newest bar the quote came from, when the adapter has one. A stream that
   * only carries a price leaves this undefined; a poll of the candle route
   * carries it, which is what lets the M1 reading advance.
   */
  candle?: Candle;
}

/** Which live-quote adapter is in use. */
export type LiveQuoteProviderId = 'poll' | 'stream';

export interface LiveQuoteRequest {
  instrumentId: string;
  /** The timeframe whose newest bar is the source of the price. */
  timeframe: Timeframe;
  /** The route to poll; the key stays server-side. */
  signal?: AbortSignal;
}

export interface LiveQuoteProvider {
  readonly id: LiveQuoteProviderId;
  readonly label: string;
  /** True when the provider can actually serve quotes. */
  isConfigured(): boolean;
  /** The cadence the provider should be driven at, in milliseconds. */
  intervalMs(): number;
  /** One quote, or null when there is nothing real to report. */
  getQuote(request: LiveQuoteRequest): Promise<LiveQuote | null>;
}

/** The candle route shape the poller reads. */
interface CandlesResponse {
  ok?: boolean;
  candles?: Candle[];
  error?: { kind?: string; message?: string; retryAfterMs?: number };
}

/**
 * LIVE_POLL_INTERVAL_MS, default 60s.
 *
 * The value is a server-side deployment fact (the browser never holds it), so
 * the status route reports it and `setLivePollIntervalMs` caches it here. Until
 * the route answers, the default applies.
 */
export const DEFAULT_LIVE_POLL_INTERVAL_MS = 60_000;

let livePollMs = DEFAULT_LIVE_POLL_INTERVAL_MS;

/** Record the cadence the status route reported. */
export function setLivePollIntervalMs(value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) livePollMs = value;
}

/** Test seam: fall back to the default cadence. */
export function resetLivePollIntervalMs(): void {
  livePollMs = DEFAULT_LIVE_POLL_INTERVAL_MS;
}

export function livePollIntervalMs(): number {
  return livePollMs;
}

/**
 * The shipped adapter: poll the candles route for the newest bar.
 *
 * It asks for two bars only, which the server serves from the payload a full
 * load already paid for, so a poll normally costs no extra credit. A rate-limit
 * answer returns null rather than throwing: the caller keeps the last real price
 * and lets its own retry schedule decide when to try again.
 */
export const pollingLiveQuoteProvider: LiveQuoteProvider = {
  id: 'poll',
  label: 'REST poll',
  isConfigured: () => true,
  intervalMs: () => livePollIntervalMs(),
  async getQuote({ instrumentId, timeframe, signal }) {
    const params = new URLSearchParams({ instrument: instrumentId, timeframe, limit: '2' });
    let response: Response;
    try {
      response = await fetch(`/api/futures/candles?${params.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return null;
    }

    let payload: CandlesResponse;
    try {
      payload = (await response.json()) as CandlesResponse;
    } catch {
      return null;
    }

    if (payload.ok === false || !Array.isArray(payload.candles) || payload.candles.length === 0) return null;

    const latest = payload.candles[payload.candles.length - 1];
    if (!Number.isFinite(latest.close) || latest.close <= 0) return null;

    return { instrumentId, price: latest.close, timestamp: Date.now(), mode: 'POLL', candle: latest };
  },
};

const adapters = new Map<LiveQuoteProviderId, LiveQuoteProvider>([[pollingLiveQuoteProvider.id, pollingLiveQuoteProvider]]);

/** Register a streaming adapter later, without touching the caller. */
export function registerLiveQuoteProvider(provider: LiveQuoteProvider): void {
  adapters.set(provider.id, provider);
}

export function liveQuoteProviderFor(id: LiveQuoteProviderId): LiveQuoteProvider {
  return adapters.get(id) ?? pollingLiveQuoteProvider;
}

/** The active adapter. A stream adapter, once registered, would be selected here. */
export function activeLiveQuoteProvider(): LiveQuoteProvider {
  return adapters.get('stream') ?? pollingLiveQuoteProvider;
}
