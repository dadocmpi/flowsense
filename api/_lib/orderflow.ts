// ============================================
// ORDER FLOW ADAPTER (server-side)
// ============================================
// THE ONE FILE TO EDIT TO CONNECT A REAL ORDER-FLOW PROVIDER.
//
// The browser never holds a vendor key, so the right-hand "Order flow" compass
// reads order flow through this server module. The client already speaks the
// shape below (see src/core/providers/orderflow.ts); connecting a vendor means
// implementing `fetchOrderFlowReading` here and setting the environment.
//
// TWO REAL VENUES SHIP, chosen PER ASSET because no single venue covers every
// market this app shows:
//
//   Gold (GC)        -> Binance   PAXG/USDT, a real gold market with a resting
//                                  depth book and an aggTrades tape
//   S&P 500 (ES)     -> Alpaca    SPY ETF proxy: real tape + top-of-book quote
//   Dow (YM)         -> Alpaca    DIA ETF proxy
//   Nasdaq 100 (NQ)  -> Alpaca    QQQ ETF proxy
//
// Binance has NO market for the equity indices, which is why the panel used to
// read "No Binance market for NQ". Routing the index assets to Alpaca — the same
// venue that already serves their candles — fixes that with a real tape.
//
//   ORDERFLOW_PROVIDER=binance|alpaca|none   force ONE venue for every asset
//   ORDERFLOW_PROVIDER_<ID>=...              override a single asset
//   ORDERFLOW_API_KEY=...                    only for a `custom` vendor
//   ALPACA_FEED=iex|sip                      the Alpaca feed (default iex)
//
// Twelve Data has NO order-flow data: a candle carries no aggressor side and no
// order book, so order flow can never be derived from the candle feed.
//
// CONTRACT
//   return a reading  -> the card renders the strength bar and the key numbers
//   return null       -> the instrument has no market on its configured venue
//   throw             -> the venue could not be read; the route reports it as
//                        unavailable, never as a fabricated reading
//
// `OrderFlowReading` is the exact shape the client expects; the score is on the
// same -100..+100 scale as the other two compasses, and the label comes from
// labelFromScore so it can never disagree with the score.

import { DEFAULT_COMPASS_CONFIG } from '../../src/config/compass.js';
import type { OrderFlowReading } from '../../src/core/types.js';
import { binanceHasMarket, fetchBinanceOrderFlowReading } from './binance.js';
import { alpacaOrderFlowConfigured, alpacaOrderFlowSymbolFor, buildAlpacaOrderFlowReading } from './alpacaOrderflow.js';

export interface OrderFlowMetrics {
  delta: number | null;
  cvd: number | null;
  imbalance: number | null;
  absorption: number | null;
}

// The reading shape lives in src/core/types so the client engine can carry it
// without a dependency on this module; re-exported here for the server surface.
export type { OrderFlowBook, OrderFlowReading, OrderFlowSession } from '../../src/core/types.js';

export type OrderFlowVendor = 'none' | 'binance' | 'alpaca' | 'custom';

/** The venue that serves each asset by default. Binance only where it has a market. */
export const ORDERFLOW_VENUE_DEFAULTS: Record<string, OrderFlowVendor> = {
  GC: 'binance',
  ES: 'alpaca',
  YM: 'alpaca',
  NQ: 'alpaca',
};

/** Parse a raw provider string into a venue, or null when it names none. */
function parseVenue(raw: string): OrderFlowVendor | null {
  const value = raw.trim().toLowerCase();
  if (value === '') return null;
  if (value === 'none' || value === 'off' || value === 'false') return 'none';
  if (value === 'binance') return 'binance';
  if (value === 'alpaca') return 'alpaca';
  return 'custom';
}

/**
 * The venue serving one asset.
 *
 * Precedence: a per-asset override wins, then the global ORDERFLOW_PROVIDER,
 * then the per-asset default. An unrecognised name resolves to `custom`, so a
 * typo cannot silently fall back to a working venue.
 */
export function orderFlowVenueFor(instrumentId: string): OrderFlowVendor {
  const id = instrumentId.toUpperCase();

  const perAsset = parseVenue(process.env[`ORDERFLOW_PROVIDER_${id}`] ?? '');
  if (perAsset) return perAsset;

  const global = parseVenue(process.env.ORDERFLOW_PROVIDER ?? '');
  if (global) return global;

  return ORDERFLOW_VENUE_DEFAULTS[id] ?? 'none';
}

/** Every asset id this module knows how to route. */
export const ORDERFLOW_ASSET_IDS = Object.keys(ORDERFLOW_VENUE_DEFAULTS);

/** The venue key. Read only on the server; never returned to the client. */
export function orderFlowApiKey(): string | null {
  const key = (process.env.ORDERFLOW_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/** True when a specific venue has everything it needs to answer. */
export function venueConfigured(vendor: OrderFlowVendor): boolean {
  if (vendor === 'binance') return true;
  if (vendor === 'alpaca') return alpacaOrderFlowConfigured();
  if (vendor === 'custom') return orderFlowApiKey() !== null;
  return false;
}

/** True when the venue serving this asset is configured. */
export function orderFlowConfiguredFor(instrumentId: string): boolean {
  return venueConfigured(orderFlowVenueFor(instrumentId));
}

/**
 * True when at least one asset's venue is configured.
 *
 * The probe (no instrument) uses this to answer "is there a source at all?".
 */
export function orderFlowConfigured(): boolean {
  return ORDERFLOW_ASSET_IDS.some(id => orderFlowConfiguredFor(id));
}

/** A human label for one venue. */
function venueLabel(vendor: OrderFlowVendor): string {
  if (vendor === 'binance') return 'Binance';
  if (vendor === 'alpaca') return 'Alpaca';
  if (vendor === 'custom') return (process.env.ORDERFLOW_PROVIDER ?? 'custom').trim() || 'Custom';
  return 'None';
}

/** A human label for the source serving one asset. */
export function orderFlowLabel(instrumentId?: string): string {
  if (instrumentId) return venueLabel(orderFlowVenueFor(instrumentId));
  const labels = [...new Set(ORDERFLOW_ASSET_IDS.map(id => venueLabel(orderFlowVenueFor(id))))].filter(
    label => label !== 'None'
  );
  return labels.length > 0 ? labels.join(' + ') : 'None';
}

/** True when the configured venue has a market for this instrument. */
export function orderFlowHasMarket(instrumentId: string): boolean {
  const vendor = orderFlowVenueFor(instrumentId);
  if (vendor === 'binance') return binanceHasMarket(instrumentId);
  if (vendor === 'alpaca') return alpacaOrderFlowSymbolFor(instrumentId) !== null;
  return false;
}

/** The rolling window the strength bar is measured over, in ms. */
export function resolveWindowMs(window: string | undefined): number {
  const key = (window ?? '').trim();
  if (key === '1m' || key === '5m' || key === '15m') return DEFAULT_COMPASS_CONFIG.flow.windows[key];
  return DEFAULT_COMPASS_CONFIG.flow.windows[DEFAULT_COMPASS_CONFIG.flow.defaultWindow];
}

/**
 * Fetch a real order-flow reading for one instrument.
 *
 * The venue is chosen per asset; the vendor call itself lives in the venue's own
 * adapter, where every request runs through that venue's meter. A `custom` venue
 * with no implementation returns null rather than inventing a value.
 */
export async function fetchOrderFlowReading(params: {
  instrumentId: string;
  timeframe: string;
  apiKey: string | null;
  window?: string;
  signal?: AbortSignal;
}): Promise<OrderFlowReading | null> {
  const vendor = orderFlowVenueFor(params.instrumentId);
  const windowMs = resolveWindowMs(params.window);

  if (vendor === 'binance') {
    return fetchBinanceOrderFlowReading(params.instrumentId, params.timeframe, params.signal);
  }

  if (vendor === 'alpaca') {
    const symbol = alpacaOrderFlowSymbolFor(params.instrumentId);
    if (!symbol) return null;
    return buildAlpacaOrderFlowReading({ symbol, windowMs, signal: params.signal });
  }

  // A named custom vendor has no implementation in this build. Returning null is
  // the honest answer: the card says the source returned no reading.
  return null;
}
