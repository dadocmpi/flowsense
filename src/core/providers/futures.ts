// ============================================
// FUTURES PROVIDER — SERVER-PROXIED
// ============================================
// Futures data needs an API key, and an API key must never reach the browser.
// So this provider does not call a vendor directly: it calls this app's own
// serverless route (`/api/futures/candles`), which holds the key in a Vercel
// environment variable and forwards the request.
//
// The provider itself is vendor-agnostic. The route decides which upstream to
// call based on FUTURES_PROVIDER; this class only needs the route's JSON
// shape. To plug in Databento, Polygon, a broker feed or anything else, add a
// branch in `api/futures/candles.ts` that returns the same shape — see the
// README section "Adding another data provider".
//
// Capabilities are declared honestly:
//   candles  yes
//   ticks    no  (a REST candle feed has no live tick stream)
//   orderFlow no (candles cannot produce a real order book or tape)
//
// Because ticks and orderFlow are false, the UI shows the last candle close as
// the price with its timestamp, and hides the order-flow panel for futures
// rather than inventing one.

import type { Candle, Timeframe } from '../types';
import type { Instrument } from '../instruments';
import { normalizeSeries } from '../candles';
import { ProviderError, type MarketDataProvider } from './types';

export interface FuturesRouteResponse {
  ok: boolean;
  candles?: Candle[];
  /** Where the numbers actually came from, for the UI's provenance line. */
  source?: string;
  /** The upstream continuous symbol that was requested. */
  symbol?: string;
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
 * Whether the futures source is configured is a server-side fact, so the
 * client asks the route once and caches the answer. Until it knows, the UI
 * shows the instrument as "checking", never as if it had data.
 */
let configuredCache: boolean | null = null;

export function setFuturesConfigured(value: boolean | null): void {
  configuredCache = value;
}

export const futuresProvider: MarketDataProvider = {
  id: 'futures',
  label: 'Futures feed (server-proxied)',
  capabilities: { candles: true, ticks: false, orderFlow: false },

  isConfigured: () => configuredCache === true,

  async getCandles(instrument, timeframe, limit, signal) {
    const params = new URLSearchParams({
      symbol: instrument.providerSymbol,
      continuous: instrument.continuousSymbol ?? '',
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
      setFuturesConfigured(payload.error?.kind === 'NOT_CONFIGURED' ? false : configuredCache);
      throw toProviderError(payload.error?.kind, payload.error?.message ?? 'Futures request failed', response.status);
    }

    if (!Array.isArray(payload.candles)) {
      throw new ProviderError('UPSTREAM', 'Futures route returned no candle array');
    }

    setFuturesConfigured(true);
    return normalizeSeries(payload.candles);
  },
};

/** Ask the route whether the server has a futures key configured. */
export async function probeFuturesProvider(signal?: AbortSignal): Promise<{ configured: boolean; note?: string }> {
  try {
    const response = await fetch('/api/futures/status', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      setFuturesConfigured(false);
      return { configured: false, note: `Status route returned HTTP ${response.status}` };
    }
    const payload = (await response.json()) as { configured?: boolean; provider?: string; note?: string };
    const configured = payload.configured === true;
    setFuturesConfigured(configured);
    return { configured, note: payload.note };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    setFuturesConfigured(false);
    return { configured: false, note: 'Could not reach the futures status route' };
  }
}
