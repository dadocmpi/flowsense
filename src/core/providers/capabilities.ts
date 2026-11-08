// ============================================
// ORDER-FLOW CAPABILITIES
// ============================================
// The order-flow panel offers two modes: Order Flow (the tape: aggressor delta
// and CVD) and Book Flow (the resting bid/ask book). Whether Book Flow can be
// offered is a fact about the VENUE, not a guess: a venue that publishes a
// resting book can, and one that does not cannot.
//
// Encoding that as a capability lets the UI decide whether to render the toggle
// without a per-vendor branch, and never hardcodes it:
//
//   hasOrderBook  true  -> the Book Flow toggle is rendered and functional
//                 false -> no toggle at all (not a disabled one)
//   hasVolume     true  -> the venue's tape carries real traded quantity
//                 false -> no volume on this venue
//
// The venue is reported by the server (the order-flow probe), so adding a venue
// with a real book is a capabilities entry plus a server adapter, with no UI
// change.

/** The order-flow venues this build understands. */
export type OrderFlowVenue = 'none' | 'binance' | 'alpaca' | 'custom';

export interface OrderFlowCapabilities {
  /**
   * The venue publishes a real resting bid/ask book (depth, not just top of
   * book). This gates the Book Flow mode.
   */
  hasOrderBook: boolean;
  /** The venue's tape carries a usable traded quantity. */
  hasVolume: boolean;
  /**
   * The venue publishes a real top-of-book quote (best bid/offer). Alpaca's IEX
   * feed does, from which a two-sided pressure bar can be built; it is a quote,
   * not a depth book, so it is a separate flag.
   */
  hasQuotes: boolean;
}

/** What each venue can honestly supply. */
export const VENUE_ORDER_FLOW_CAPABILITIES: Record<OrderFlowVenue, OrderFlowCapabilities> = {
  // No source at all: no tape, no book and no quote.
  none: { hasOrderBook: false, hasVolume: false, hasQuotes: false },
  // Binance publishes a real depth book and a tape with the aggressor side.
  binance: { hasOrderBook: true, hasVolume: true, hasQuotes: true },
  // Alpaca (IEX) publishes a real tape with volume and a real top-of-book quote,
  // but no depth book: Book Flow is a two-sided quote bar, not a depth ladder.
  alpaca: { hasOrderBook: false, hasVolume: true, hasQuotes: true },
  // A named vendor we have not implemented: assume the honest minimum.
  custom: { hasOrderBook: false, hasVolume: false, hasQuotes: false },
};

/** Capabilities for a venue id, defaulting to the honest minimum. */
export function orderFlowCapabilitiesForVenue(venue: string | null | undefined): OrderFlowCapabilities {
  if (venue === 'binance' || venue === 'alpaca' || venue === 'none' || venue === 'custom') {
    return VENUE_ORDER_FLOW_CAPABILITIES[venue];
  }
  return { hasOrderBook: false, hasVolume: false, hasQuotes: false };
}
