// ============================================
// ORDER BOOK PROVIDER
// ============================================
// The RIGHT reading is the resting ORDER BOOK: the size bid against the size
// offered, plus the traded volume that corroborates it. That data does NOT exist
// in the Twelve Data candle feed — a candle carries no aggressor side and no book
// — so it is never derived from candles here. It comes from a provider, or the
// line says there is none.
//
// This module defines the provider seam and ships the `none` adapter plus the
// `http` adapter. `none` means no source: the line shows "No order book source
// configured" and draws nothing. Nothing is mocked and no number is invented.
//
// HOW A REAL SOURCE IS WIRED
// The browser never holds a vendor key, so every adapter talks to this app's own
// server route (`/api/orderflow/reading`), which holds the key. The shipped
// source is Alpaca's snapshot endpoint, read through that route and enabled by
// the same ALPACA_API_KEY / ALPACA_API_SECRET the index assets already use. The
// `http` adapter below returns the raw book quote; the pressure percentage is
// computed locally in src/core/orderbook, so the number can never disagree with
// the book it came from. A different vendor is a server-side change in
// api/_lib/orderflow.ts, not a client one.
//
// The interface is deliberately narrow so a futures book feed (or any other
// vendor) can be dropped in behind it without touching the scoring or the UI.

import type { Instrument } from '../instruments';
import type { BookQuote } from '../orderbook';
import type { Timeframe } from '../types';

// The reading shape lives in core/types so the engine can carry it without a
// dependency on this module; re-exported here for the provider surface.
export type { OrderFlowReading, OrderFlowMetrics } from '../types';
export type { BookQuote } from '../orderbook';

/** Which order-book adapter is in use. `none` means "no source configured". */
export type OrderFlowProviderId = 'none' | 'http';

export interface OrderFlowContext {
  instrument: Instrument;
  timeframe: Timeframe;
  signal?: AbortSignal;
}

export interface OrderFlowProvider {
  readonly id: OrderFlowProviderId;
  readonly label: string;
  /** True when the source has everything it needs to answer. */
  isConfigured(): boolean;
  /**
   * A real book snapshot, or null when there is nothing to read.
   *
   * Returning null is the honest answer for an unconfigured or silent source;
   * an adapter must never substitute a placeholder. The raw quote is returned
   * unscored: the pressure percentage is computed locally from this book, so the
   * number can never disagree with it.
   */
  getReading(context: OrderFlowContext): Promise<BookQuote | null>;
}

/** The shipped adapter: no order-book source, so no reading. */
export const noneOrderFlowProvider: OrderFlowProvider = {
  id: 'none',
  label: 'None',
  isConfigured: () => false,
  getReading: async () => null,
};

/**
 * The adapter that talks to our own server route.
 *
 * It is generic on purpose: the vendor-specific work — and the API key — lives
 * server-side in api/_lib/orderflow.ts, so plugging in a futures book feed is a
 * server change, not a client one.
 */
export const httpOrderFlowProvider: OrderFlowProvider = {
  id: 'http',
  label: 'Server order book',
  isConfigured: () => configuredOrderFlow,
  async getReading({ instrument, timeframe, signal }) {
    if (!configuredOrderFlow) return null;

    const params = new URLSearchParams({ instrument: instrument.id, timeframe });
    let response: Response;
    try {
      response = await fetch(`/api/orderflow/reading?${params.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return null;
    }

    let payload: { book?: BookQuote | null } | null = null;
    try {
      payload = (await response.json()) as { book?: BookQuote | null };
    } catch {
      return null;
    }

    // A source that has nothing to report says so with null; we do not turn that
    // into a reading.
    return payload?.book ?? null;
  },
};

const adapters = new Map<OrderFlowProviderId, OrderFlowProvider>([
  [noneOrderFlowProvider.id, noneOrderFlowProvider],
  [httpOrderFlowProvider.id, httpOrderFlowProvider],
]);

/** True once the server has confirmed a source is configured. */
let configuredOrderFlow = false;

export function registerOrderFlowProvider(provider: OrderFlowProvider): void {
  adapters.set(provider.id, provider);
}

/** The adapter for an id, falling back to `none` rather than guessing. */
export function orderFlowProviderFor(id: OrderFlowProviderId): OrderFlowProvider {
  return adapters.get(id) ?? noneOrderFlowProvider;
}

/** The provider id the server last reported. */
let activeProviderId: OrderFlowProviderId = 'none';

export function activeOrderFlowProviderId(): OrderFlowProviderId {
  return activeProviderId;
}

/** The provider currently in use, per the last server probe. */
export function activeOrderFlowProvider(): OrderFlowProvider {
  return orderFlowProviderFor(activeProviderId);
}

export interface OrderFlowProbeResult {
  configured: boolean;
  provider: OrderFlowProviderId;
  label: string;
  /** Why it is unavailable, when it is. */
  note: string | null;
  /** False when the route could not be reached at all. */
  reachable: boolean;
}

let probeCache: OrderFlowProbeResult | null = null;
let probeInFlight: Promise<OrderFlowProbeResult> | null = null;

/**
 * Ask the server whether an order-flow source is configured.
 *
 * The answer is a server-side fact (the env vars are not in the bundle), so it
 * is asked once and cached. Concurrent callers share the one request. The route
 * costs no vendor credits.
 */
export function probeOrderFlowProvider(): Promise<OrderFlowProbeResult> {
  if (probeCache) return Promise.resolve(probeCache);
  if (probeInFlight) return probeInFlight;

  probeInFlight = runOrderFlowProbe()
    .then(result => {
      probeCache = result;
      activeProviderId = result.provider;
      configuredOrderFlow = result.configured;
      return result;
    })
    .finally(() => {
      probeInFlight = null;
    });

  return probeInFlight;
}

async function runOrderFlowProbe(): Promise<OrderFlowProbeResult> {
  try {
    const response = await fetch('/api/orderflow/reading', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return { configured: false, provider: 'none', label: 'None', note: `Order flow route returned HTTP ${response.status}`, reachable: false };
    }
    const payload = (await response.json()) as {
      configured?: boolean;
      provider?: string;
      label?: string;
      note?: string;
    };
    const provider: OrderFlowProviderId = payload.provider === 'http' ? 'http' : 'none';
    return {
      configured: payload.configured === true,
      provider,
      label: payload.label ?? 'None',
      note: payload.note ?? null,
      reachable: true,
    };
  } catch {
    return { configured: false, provider: 'none', label: 'None', note: 'Could not reach the order flow route', reachable: false };
  }
}

/** Test seam: forget the cached probe. */
export function clearOrderFlowCache(): void {
  probeCache = null;
  probeInFlight = null;
  activeProviderId = 'none';
  configuredOrderFlow = false;
}
