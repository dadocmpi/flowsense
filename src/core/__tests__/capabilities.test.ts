// ============================================
// ORDER-FLOW CAPABILITIES TESTS
// ============================================
// The capability flags are what let the UI disable Book Flow instead of showing
// an error, and what tell the estimate whether a usable volume exists. The one
// invariant that must never regress: Twelve Data has NO order book.

import { describe, expect, it } from 'vitest';
import {
  orderFlowCapabilitiesFor,
  orderFlowCapabilitiesForProvider,
  VENDOR_ORDER_FLOW_CAPABILITIES,
} from '../providers/capabilities';
import { findInstrument } from '../instruments';

describe('order-flow capabilities', () => {
  it('reports no order book for Twelve Data (Gold)', () => {
    expect(VENDOR_ORDER_FLOW_CAPABILITIES.twelvedata.hasOrderBook).toBe(false);
    expect(orderFlowCapabilitiesForProvider('twelvedata').hasOrderBook).toBe(false);
  });

  it('reports no usable volume for Twelve Data, so the estimate falls back to range', () => {
    expect(VENDOR_ORDER_FLOW_CAPABILITIES.twelvedata.hasVolume).toBe(false);
  });

  it('reports real volume for Alpaca', () => {
    expect(VENDOR_ORDER_FLOW_CAPABILITIES.alpaca.hasVolume).toBe(true);
  });

  it('resolves capabilities from the instrument that is being shown', () => {
    const gold = findInstrument('GC')!;
    const spx = findInstrument('ES')!;
    expect(orderFlowCapabilitiesFor(gold)).toEqual({ hasOrderBook: false, hasVolume: false });
    expect(orderFlowCapabilitiesFor(spx)).toEqual({ hasOrderBook: false, hasVolume: true });
  });
});
