// ============================================
// ORDER-FLOW CAPABILITIES TESTS
// ============================================
// The capability flags are what let the UI decide whether to render the Book
// Flow toggle, and they are driven by the VENUE the server reports — never
// hardcoded. The one invariant that must never regress: only a venue with a real
// book enables Book Flow.

import { describe, expect, it } from 'vitest';
import {
  orderFlowBookLabelForVenue,
  orderFlowCapabilitiesForVenue,
  VENUE_ORDER_FLOW_CAPABILITIES,
} from '../providers/capabilities';

describe('order-flow capabilities', () => {
  it('enables Book Flow for Alpaca, which publishes the IEX top of book', () => {
    expect(VENUE_ORDER_FLOW_CAPABILITIES.alpaca.hasOrderBook).toBe(true);
    expect(VENUE_ORDER_FLOW_CAPABILITIES.alpaca.hasVolume).toBe(true);
    expect(orderFlowCapabilitiesForVenue('alpaca')).toEqual({ hasOrderBook: true, hasVolume: true });
  });

  it('does not enable Book Flow with no source', () => {
    expect(orderFlowCapabilitiesForVenue('none').hasOrderBook).toBe(false);
  });

  it('falls back to the honest minimum for an unknown venue', () => {
    expect(orderFlowCapabilitiesForVenue('mystery')).toEqual({ hasOrderBook: false, hasVolume: false });
    expect(orderFlowCapabilitiesForVenue(null)).toEqual({ hasOrderBook: false, hasVolume: false });
    expect(orderFlowCapabilitiesForVenue(undefined)).toEqual({ hasOrderBook: false, hasVolume: false });
  });
});

describe('order-flow book label', () => {
  it('names Alpaca\'s one-level book "Top of book"', () => {
    expect(orderFlowBookLabelForVenue('alpaca')).toBe('Top of book');
  });

  it('never calls a one-level book a depth ladder', () => {
    expect(orderFlowBookLabelForVenue('alpaca')).not.toBe('Depth');
  });
});
