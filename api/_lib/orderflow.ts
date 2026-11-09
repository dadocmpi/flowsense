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
//   ORDERFLOW_PROVIDER=alpaca            a real venue, wired up in this build
//   ORDERFLOW_PROVIDER=<name>            any other vendor you implement
//   ORDERFLOW_API_KEY=...                only for vendors that need one
//
// Alpaca is the SHIPPED real source (api/_lib/alpacaOrderFlow.ts): its
// market-data API carries a tape of every trade and the real top-of-book quote
// for the index assets (S&P 500, Dow, Nasdaq) and Gold, read with the same
// server-side credentials the candle feed already uses. That is real order flow,
// not a candle-derived proxy.
//
// Twelve Data has NO order-flow data. A candle carries no aggressor side and no
// order book, so order flow can never be derived from the candle feed.
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
import { alpacaConfigured, alpacaKeyId, alpacaSecretKey } from './futuresShared.js';
import { alpacaOrderFlowHasMarket, fetchAlpacaOrderFlowReading } from './alpacaOrderFlow.js';

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

export type OrderFlowVendor = 'none' | 'alpaca' | 'custom';

/**
 * Which adapter this deployment is configured to use.
 *
 * Default: Alpaca. It reads the index assets (S&P 500, Dow, Nasdaq) and Gold
 * through their liquid ETF proxies, using the same server-side credentials the
 * candle feed already uses. Set ORDERFLOW_PROVIDER=none to switch it off, or to
 * a named vendor you implement yourself.
 */
export function resolveOrderFlowVendor(): OrderFlowVendor {
  const raw = (process.env.ORDERFLOW_PROVIDER ?? 'alpaca').trim().toLowerCase();
  if (raw === 'none' || raw === 'off' || raw === 'false') return 'none';
  if (raw === 'alpaca') return 'alpaca';
  if (raw === '') return 'alpaca';
  return 'custom';
}

/**
 * The vendor key, when a named `custom` vendor needs one.
 *
 * The shipped Alpaca source does NOT use this: it authenticates with the shared
 * ALPACA_API_KEY / ALPACA_API_SECRET pair, read only under api/.
 */
export function orderFlowApiKey(): string | null {
  const key = (process.env.ORDERFLOW_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/**
 * True when a source is configured AND has everything it needs.
 *
 * Alpaca needs its two server-side credentials (the same pair the candle feed
 * uses). A named `custom` vendor without a key is not configured: saying so is
 * more useful than failing later with a vendor error the user cannot act on.
 */
export function orderFlowConfigured(): boolean {
  const vendor = resolveOrderFlowVendor();
  if (vendor === 'alpaca') return alpacaConfigured();
  return vendor === 'custom' && orderFlowApiKey() !== null;
}

/** A human label for the configured source, for the provenance line. */
export function orderFlowLabel(): string {
  const vendor = resolveOrderFlowVendor();
  if (vendor === 'alpaca') return 'Alpaca';
  if (vendor === 'custom') return (process.env.ORDERFLOW_PROVIDER ?? 'custom').trim();
  return 'None';
}

/** True when the configured venue has a market for this instrument. */
export function orderFlowHasMarket(instrumentId: string): boolean {
  const vendor = resolveOrderFlowVendor();
  if (vendor === 'alpaca') return alpacaOrderFlowHasMarket(instrumentId);
  return vendor === 'custom';
}

/**
 * Fetch a real order-flow reading for one instrument and timeframe.
 *
 * Alpaca is the shipped source; the call itself lives in
 * api/_lib/alpacaOrderFlow.ts, where every request runs through the Alpaca
 * meter. A `custom` vendor with no implementation returns null rather than
 * inventing a value.
 */
export async function fetchOrderFlowReading(params: {
  instrumentId: string;
  timeframe: string;
  apiKey: string | null;
  signal?: AbortSignal;
}): Promise<OrderFlowReading | null> {
  const vendor = resolveOrderFlowVendor();
  if (vendor === 'alpaca') {
    const keyId = alpacaKeyId();
    const secretKey = alpacaSecretKey();
    if (!keyId || !secretKey) return null;
    return fetchAlpacaOrderFlowReading({
      instrumentId: params.instrumentId,
      keyId,
      secretKey,
      signal: params.signal,
    });
  }
  // A named custom vendor has no implementation in this build. Returning null is
  // the honest answer: the card says the source returned no reading.
  return null;
}
