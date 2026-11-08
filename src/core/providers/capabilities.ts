// ============================================
// ORDER-FLOW PROVIDER CAPABILITIES
// ============================================
// A provider does not only differ in WHERE it gets candles; it differs in what it
// can honestly supply for the order-flow panel. Twelve Data publishes no resting
// bid/ask book and often no usable volume for XAU/USD; Alpaca carries real traded
// volume. Encoding that as a capability lets the UI decide what to enable without
// a per-vendor branch:
//
//   hasOrderBook  true  -> the Book Flow mode can be offered
//                 false -> Book Flow is disabled with a hint, never an error
//   hasVolume     true  -> the estimate's activity weight can use candle volume
//                 false -> the estimate falls back to a range-based proxy
//
// The estimate auto-detects the proxy from the candles themselves, so `hasVolume`
// is a declared hint rather than a hard switch; `hasOrderBook` is what gates the
// Book Flow mode. A future provider with a real book sets `hasOrderBook: true`
// and Book Flow lights up with no UI change.

import type { Instrument, ProviderId } from '../instruments';

export interface OrderFlowCapabilities {
  /** The provider publishes a real resting bid/ask book. */
  hasOrderBook: boolean;
  /** The provider's candles carry a usable traded volume. */
  hasVolume: boolean;
}

/** What each vendor can honestly supply. */
export const VENDOR_ORDER_FLOW_CAPABILITIES: Record<ProviderId, OrderFlowCapabilities> = {
  // Twelve Data: no order book, and often empty/zero volume for XAU/USD.
  twelvedata: { hasOrderBook: false, hasVolume: false },
  // Alpaca: real traded volume. This build wires no book route, so a book is not
  // offered yet; a future adapter sets this true and Book Flow appears.
  alpaca: { hasOrderBook: false, hasVolume: true },
};

/** Capabilities for a provider id, defaulting to the honest minimum. */
export function orderFlowCapabilitiesForProvider(providerId: ProviderId): OrderFlowCapabilities {
  return VENDOR_ORDER_FLOW_CAPABILITIES[providerId] ?? { hasOrderBook: false, hasVolume: false };
}

/** Capabilities for an instrument, from the provider that serves it. */
export function orderFlowCapabilitiesFor(instrument: Instrument): OrderFlowCapabilities {
  return orderFlowCapabilitiesForProvider(instrument.providerId);
}
