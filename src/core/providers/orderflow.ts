// ============================================
// ORDER FLOW PROVIDER
// ============================================
// The RIGHT compass reads order flow: aggressive buy/sell delta, cumulative
// volume delta, order-book imbalance and absorption. That data does NOT exist in
// the Twelve Data candle feed — a candle carries no aggressor side and no book —
// so it is never derived from candles here. It comes from a provider, or the
// card says there is none.
//
// This module defines the provider seam and ships exactly ONE adapter: `none`.
// With `none` the card shows "No order flow source configured" and draws no
// gauge reading. Nothing is mocked and no number is invented.
//
// HOW TO ADD A REAL SOURCE
// The browser never holds a vendor key, so every adapter talks to this app's own
// server route (`/api/orderflow/reading`), which holds the key. Adding a source
// is therefore a SERVER-SIDE change: implement the vendor call in the one file
//
//     api/_lib/orderflow.ts
//
// and set ORDERFLOW_PROVIDER / ORDERFLOW_API_KEY in the deployment. The `http`
// adapter below already speaks that route, so no client file needs to change.
// The interface is deliberately narrow so a futures book feed (or any other
// vendor) can be dropped in behind it without touching the scoring or the UI.

import type { Instrument } from '../instruments';
import type { OrderFlowReading, Timeframe } from '../types';

// The reading shape lives in core/types so the engine can carry it without a
// dependency on this module; re-exported here for the provider surface.
export type { OrderFlowReading, OrderFlowMetrics } from '../types';

/** Which order-flow adapter is in use. `none` means "no source configured". */
export type OrderFlowProviderId = 'none' | 'http';

export interface OrderFlowContext {
  instrument: Instrument;
  timeframe: Timeframe;
  signal?: AbortSignal;
}

/**
 * The outcome of asking a venue for a reading.
 *
 * `reading` is null when there is nothing real to show; `note` then carries the
 * venue's own reason (e.g. "No Alpaca market for ES."), so the card can say why
 * instead of a generic message. A note is never a substitute for a reading.
 *
 * `venue`/`label` name the venue THIS instrument reads, which the server decides
 * per asset (every shipped asset reads Alpaca). They drive the
 * panel's capabilities, so the book a venue publishes is named correctly.
 */
export interface OrderFlowResult {
  reading: OrderFlowReading | null;
  note: string | null;
  venue?: string | null;
  label?: string | null;
}

export interface OrderFlowProvider {
  readonly id: OrderFlowProviderId;
  readonly label: string;
  /** True when the source has everything it needs to answer. */
  isConfigured(): boolean;
  /**
   * A real reading, or null when there is nothing to read.
   *
   * Returning null is the honest answer for an unconfigured or silent source;
   * an adapter must never substitute a placeholder.
   */
  getReading(context: OrderFlowContext): Promise<OrderFlowResult>;
}

/** The shipped adapter: no order-flow source, so no reading. */
export const noneOrderFlowProvider: OrderFlowProvider = {
  id: 'none',
  label: 'None',
  isConfigured: () => false,
  getReading: async () => ({ reading: null, note: null }),
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
  label: 'Server order flow',
  isConfigured: () => configuredOrderFlow,
  async getReading({ instrument, timeframe, signal }) {
    if (!configuredOrderFlow) return { reading: null, note: null };

    const params = new URLSearchParams({ instrument: instrument.id, timeframe });
    let response: Response;
    try {
      response = await fetch(`/api/orderflow/reading?${params.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return { reading: null, note: 'Could not reach the order flow route.' };
    }

    let payload: { reading?: OrderFlowReading | null; note?: string | null; venue?: string; label?: string } | null = null;
    try {
      payload = (await response.json()) as {
        reading?: OrderFlowReading | null;
        note?: string | null;
        venue?: string;
        label?: string;
      };
    } catch {
      return { reading: null, note: 'The order flow route returned an unreadable body.' };
    }

    // A source that has nothing to report says so with null; we do not turn that
    // into a reading, but we do keep its reason and the venue it names.
    return {
      reading: payload?.reading ?? null,
      note: payload?.note ?? null,
      venue: payload?.venue ?? null,
      label: payload?.label ?? null,
    };
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
  /** The configured venue id, e.g. "alpaca" or "none". */
  venue: string;
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
      return { configured: false, provider: 'none', label: 'None', venue: 'none', note: `Order flow route returned HTTP ${response.status}`, reachable: false };
    }
    const payload = (await response.json()) as {
      configured?: boolean;
      provider?: string;
      label?: string;
      venue?: string;
      note?: string;
    };
    const provider: OrderFlowProviderId = payload.provider === 'http' ? 'http' : 'none';
    return {
      configured: payload.configured === true,
      provider,
      label: payload.label ?? 'None',
      venue: payload.venue ?? 'none',
      note: payload.note ?? null,
      reachable: true,
    };
  } catch {
    return { configured: false, provider: 'none', label: 'None', venue: 'none', note: 'Could not reach the order flow route', reachable: false };
  }
}

/** Test seam: forget the cached probe. */
export function clearOrderFlowCache(): void {
  probeCache = null;
  probeInFlight = null;
  activeProviderId = 'none';
  configuredOrderFlow = false;
}
