// ============================================
// ORDER-FLOW CAPABILITIES TESTS
// ============================================
// The capability flags are what let the UI decide whether to render the Book
// Flow toggle, and they are driven by the VENUE the server reports — never
// hardcoded. The one invariant that must never regress: only a venue with a real
// book enables Book Flow.

import { describe, expect, it } from 'vitest';
import {
  orderFlowCapabilitiesForVenue,
  VENUE_ORDER_FLOW_CAPABILITIES,
} from '../providers/capabilities';

describe('order-flow capabilities', () => {
  it('enables Book Flow for Binance, which publishes a real depth book', () => {
    expect(VENUE_ORDER_FLOW_CAPABILITIES.binance.hasOrderBook).toBe(true);
    expect(VENUE_ORDER_FLOW_CAPABILITIES.binance.hasVolume).toBe(true);
    expect(orderFlowCapabilitiesForVenue('binance')).toEqual({
      hasOrderBook: true,
      hasVolume: true,
      hasQuotes: true,
    });
  });

  it('gives Alpaca a real tape and quote but no depth book', () => {
    // Alpaca publishes a real tape and a real top-of-book quote, so the tape and
    // the quote bar work; it publishes no depth ladder, so Book Flow (a depth
    // mode) stays off and is not rendered for an Alpaca asset.
    expect(orderFlowCapabilitiesForVenue('alpaca')).toEqual({
      hasOrderBook: false,
      hasVolume: true,
      hasQuotes: true,
    });
  });

  it('does not enable Book Flow with no source', () => {
    expect(orderFlowCapabilitiesForVenue('none').hasOrderBook).toBe(false);
  });

  it('falls back to the honest minimum for an unknown venue', () => {
    const minimum = { hasOrderBook: false, hasVolume: false, hasQuotes: false };
    expect(orderFlowCapabilitiesForVenue('mystery')).toEqual(minimum);
    expect(orderFlowCapabilitiesForVenue(null)).toEqual(minimum);
    expect(orderFlowCapabilitiesForVenue(undefined)).toEqual(minimum);
  });
});
