// ============================================
// ORDER FLOW ADAPTER (server-side)
// ============================================
// THE ONE FILE TO EDIT TO CONNECT A REAL ORDER-FLOW PROVIDER.
//
// The browser never holds a vendor key, so the right-hand "Order flow" compass
// reads order flow through this server module. The client already speaks the
// shape below (see src/core/providers/orderflow.ts); connecting a vendor means
// implementing `fetchOrderFlowReading` here and setting the environment in the
// deployment:
//
//   ORDERFLOW_PROVIDER=binance           a real venue, wired up in this build
//   ORDERFLOW_PROVIDER=alpaca            a real venue, wired up in this build
//   ORDERFLOW_PROVIDER=<name>            any other vendor you implement
//   ORDERFLOW_API_KEY=...                only for vendors that need one
//
// TWO REAL VENUES SHIP, and the venue is chosen PER ASSET:
//
//   GC  Gold     -> Binance  (PAXG/USDT: a real gold market, no key needed)
//   ES  S&P 500  -> Alpaca   (SPY tape + IEX top of book, same key as candles)
//   YM  Dow      -> Alpaca   (DIA)
//   NQ  Nasdaq   -> Alpaca   (QQQ)
//
// Binance publishes a multi-level depth book and a tape with the aggressor side.
// Alpaca publishes the tape (no aggressor flag, classified with the tick rule)
// and the IEX top of book only — its adapter discloses both facts. Neither is
// derived from candles: a candle carries no aggressor side and no book.
//
// The default can be overridden per asset, or for the whole deployment:
//
//   ORDERFLOW_PROVIDER=none              switch order flow off everywhere
//   ORDERFLOW_PROVIDER=binance|alpaca    force one venue for every asset
//   ORDERFLOW_PROVIDER_<ID>=binance|alpaca|none   override one asset
//
// CONTRACT
//   return a reading  -> the card renders the gauge and the key numbers
//   return null       -> the instrument has no market on the configured venue
//   throw             -> the venue could not be read; the route reports it as
//                        unavailable, never as a fabricated reading
//
// `OrderFlowReading` is the exact shape the client expects:
//   { gauge: { score, label, tally, details }, metrics: { delta, cvd,
//     imbalance, absorption }, source: 'vendor name' }
// The score is on the same -100..+100 scale as the other two compasses, and the
// label must come from labelFromScore so it can never disagree with the score.

import type { GaugeReading } from '../../src/core/types.js';
import { binanceHasMarket, fetchBinanceOrderFlowReading } from './binance.js';
import { alpacaHasMarket, fetchAlpacaOrderFlowReading } from './alpacaOrderflow.js';
import { alpacaConfigured } from './futuresShared.js';

export interface OrderFlowMetrics {
  delta: number | null;
  cvd: number | null;
  imbalance: number | null;
  absorption: number | null;
}

export interface OrderFlowReading {
  gauge: GaugeReading;
  metrics: OrderFlowMetrics;
  source: string;
}

export type OrderFlowVendor = 'none' | 'binance' | 'alpaca' | 'custom';

/**
 * The venue each asset reads by default when ORDERFLOW_PROVIDER is unset.
 *
 * Gold stays on Binance (PAXG/USDT, a real gold market). The three index assets
 * read Alpaca, which already serves their candles, so their order flow comes
 * from the same configured key.
 */
export const DEFAULT_ORDERFLOW_VENUE: Record<string, OrderFlowVendor> = {
  GC: 'binance',
  ES: 'alpaca',
  YM: 'alpaca',
  NQ: 'alpaca',
};

/** Human labels for the venues, for the provenance line. */
const VENUE_LABELS: Record<OrderFlowVendor, string> = {
  none: 'None',
  binance: 'Binance',
  alpaca: 'Alpaca',
  custom: 'Custom',
};

/** Parse one vendor token (from any env var) into a venue. */
function venueFromToken(raw: string): OrderFlowVendor | null {
  const value = raw.trim().toLowerCase();
  if (value === 'none' || value === 'off' || value === 'false') return 'none';
  if (value === 'binance') return 'binance';
  if (value === 'alpaca') return 'alpaca';
  if (value === '') return null;
  return 'custom';
}

/**
 * The DEPLOYMENT-WIDE venue, when ORDERFLOW_PROVIDER is set.
 *
 * Returns null when it is unset, which is what lets the per-asset defaults take
 * over. Setting it to a venue (or `none`) forces that choice for every asset.
 */
export function orderFlowGlobalOverride(): OrderFlowVendor | null {
  return venueFromToken(process.env.ORDERFLOW_PROVIDER ?? '');
}

/**
 * Which adapter this deployment is configured to use, ignoring per-asset
 * defaults.
 *
 * Default: Binance. It is a real public venue that needs no key, so order flow
 * works out of the box. Set ORDERFLOW_PROVIDER=none to switch it off, or to a
 * named vendor you implement yourself.
 */
export function resolveOrderFlowVendor(): OrderFlowVendor {
  return orderFlowGlobalOverride() ?? 'binance';
}

/**
 * The venue a specific instrument reads.
 *
 * Precedence: an explicit ORDERFLOW_PROVIDER for the whole deployment, then an
 * ORDERFLOW_PROVIDER_<ID> for that asset, then the per-asset default. An unknown
 * asset falls back to the global default rather than guessing a venue.
 */
export function orderFlowVenueFor(instrumentId: string): OrderFlowVendor {
  const global = orderFlowGlobalOverride();
  if (global) return global;

  const id = instrumentId.toUpperCase();
  const perAsset = venueFromToken(process.env[`ORDERFLOW_PROVIDER_${id}`] ?? '');
  if (perAsset) return perAsset;

  return DEFAULT_ORDERFLOW_VENUE[id] ?? resolveOrderFlowVendor();
}

/** The vendor key for a `custom` vendor. Read only on the server; never returned. */
export function orderFlowApiKey(): string | null {
  const key = (process.env.ORDERFLOW_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/** True when the named venue has everything it needs to answer. */
export function venueConfigured(venue: OrderFlowVendor): boolean {
  if (venue === 'binance') return true;
  if (venue === 'alpaca') return alpacaConfigured();
  if (venue === 'custom') return orderFlowApiKey() !== null;
  return false;
}

/**
 * True when the venue configured for ONE instrument can answer.
 *
 * Binance needs no key; Alpaca needs its two credentials; a `custom` vendor
 * needs a key. Saying "not configured" is more useful than failing later with a
 * vendor error the user cannot act on.
 */
export function orderFlowConfiguredFor(instrumentId: string): boolean {
  return venueConfigured(orderFlowVenueFor(instrumentId));
}

/**
 * True when ANY asset has a configured order-flow venue.
 *
 * This is the probe answer to "is there a source at all?" — the client asks it
 * once, with no instrument. A deployment with a source for one asset and none
 * for another is still configured; the per-asset card says which is which.
 */
export function orderFlowConfigured(): boolean {
  return Object.keys(DEFAULT_ORDERFLOW_VENUE).some(id => orderFlowConfiguredFor(id));
}

/** A human label for the venue configured for one instrument. */
export function orderFlowLabelFor(instrumentId: string): string {
  const venue = orderFlowVenueFor(instrumentId);
  if (venue === 'custom') {
    const raw = process.env.ORDERFLOW_PROVIDER ?? process.env[`ORDERFLOW_PROVIDER_${instrumentId.toUpperCase()}`] ?? 'custom';
    return raw.trim();
  }
  return VENUE_LABELS[venue];
}

/** A human label for the deployment-wide venue, for the probe line. */
export function orderFlowLabel(): string {
  const venue = resolveOrderFlowVendor();
  if (venue === 'custom') return (process.env.ORDERFLOW_PROVIDER ?? 'custom').trim();
  return VENUE_LABELS[venue];
}

/** True when the venue configured for this instrument has a market to read. */
export function orderFlowHasMarket(instrumentId: string): boolean {
  const venue = orderFlowVenueFor(instrumentId);
  if (venue === 'binance') return binanceHasMarket(instrumentId);
  if (venue === 'alpaca') return alpacaHasMarket(instrumentId);
  return venue === 'custom';
}

export interface FetchOrderFlowParams {
  instrumentId: string;
  timeframe: string;
  apiKey: string | null;
  /** Alpaca credentials, when the asset's venue is Alpaca. */
  keyId?: string | null;
  secretKey?: string | null;
  signal?: AbortSignal;
}

/**
 * Fetch a real order-flow reading for one instrument and timeframe.
 *
 * The venue is chosen per asset (see orderFlowVenueFor). Each call lives in its
 * own adapter, where every request runs through that venue's meter. A `custom`
 * vendor with no implementation returns null rather than inventing a value.
 */
export async function fetchOrderFlowReading(params: FetchOrderFlowParams): Promise<OrderFlowReading | null> {
  const venue = orderFlowVenueFor(params.instrumentId);

  if (venue === 'binance') {
    return fetchBinanceOrderFlowReading(params.instrumentId, params.timeframe, params.signal);
  }

  if (venue === 'alpaca') {
    const keyId = params.keyId ?? '';
    const secretKey = params.secretKey ?? '';
    if (!keyId || !secretKey) {
      throw new Error('Alpaca credentials are not configured for order flow');
    }
    return fetchAlpacaOrderFlowReading(params.instrumentId, params.timeframe, keyId, secretKey, params.signal);
  }

  // A named custom vendor has no implementation in this build. Returning null is
  // the honest answer: the card says the source returned no reading.
  return null;
}
