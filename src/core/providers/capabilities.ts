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
export type OrderFlowVenue = 'none' | 'alpaca' | 'custom';

export interface OrderFlowCapabilities {
  /** The venue publishes a real resting bid/ask book. */
  hasOrderBook: boolean;
  /** The venue's tape carries a usable traded quantity. */
  hasVolume: boolean;
}

/** What each venue can honestly supply. */
export const VENUE_ORDER_FLOW_CAPABILITIES: Record<OrderFlowVenue, OrderFlowCapabilities> = {
  // No source at all: no tape and no book.
  none: { hasOrderBook: false, hasVolume: false },
  // Alpaca publishes a real tape and the IEX best bid/ask — a real but one-level
  // book. It has a book to switch to, so Book Flow is offered; the panel labels it
  // "top of book", never "depth", because Alpaca exposes no depth ladder and the
  // IEX feed is one exchange's quote, not the consolidated NBBO.
  alpaca: { hasOrderBook: true, hasVolume: true },
  // A named vendor we have not implemented: assume the honest minimum.
  custom: { hasOrderBook: false, hasVolume: false },
};

/** Capabilities for a venue id, defaulting to the honest minimum. */
export function orderFlowCapabilitiesForVenue(venue: string | null | undefined): OrderFlowCapabilities {
  if (venue === 'alpaca' || venue === 'none' || venue === 'custom') {
    return VENUE_ORDER_FLOW_CAPABILITIES[venue];
  }
  return { hasOrderBook: false, hasVolume: false };
}

/**
 * How to name the book a venue publishes, for the Book Flow mode.
 *
 * Alpaca publishes only the IEX best bid/ask, i.e. the top of book — a one-level
 * book, not a depth ladder, and one exchange's quote rather than the consolidated
 * NBBO. A venue with no book gets no label because no Book Flow is shown.
 */
export function orderFlowBookLabelForVenue(venue: string | null | undefined): string {
  if (venue === 'alpaca') return 'Top of book';
  return 'Book';
}
