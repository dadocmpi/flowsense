// ============================================
// PRICE RELAY TESTS
// ============================================
// The relay translates a vendor price frame into the frame the client parser
// accepts. It must forward real prices and drop everything else — a heartbeat
// or a malformed frame must never become a tick.

import { describe, expect, it } from 'vitest';
import { relayPriceFrame, subscribeFrame, vendorSocketUrl } from '../priceRelay.js';
import { parseWsMessage } from '../../../src/core/providers/twelvedataWs.js';

describe('relayPriceFrame', () => {
  it('normalises string price and timestamp into the client frame', () => {
    const frame = relayPriceFrame(JSON.stringify({ event: 'price', symbol: 'XAU/USD', price: '2330.5', timestamp: '1718' }));
    expect(frame).not.toBeNull();
    expect(JSON.parse(frame!)).toEqual({ event: 'price', symbol: 'XAU/USD', price: 2330.5, timestamp: 1718 });
  });

  it('produces a frame the client parser accepts', () => {
    const frame = relayPriceFrame(JSON.stringify({ event: 'price', symbol: 'XAU/USD', price: '2330.5', timestamp: 1718 }))!;
    const parsed = parseWsMessage(frame);
    expect(parsed.kind).toBe('PRICE');
    if (parsed.kind === 'PRICE') {
      expect(parsed.message.price).toBe(2330.5);
      // The client parser turns vendor seconds into epoch ms.
      expect(parsed.message.timestamp).toBe(1718 * 1000);
    }
  });

  it('drops a heartbeat rather than forwarding it as a price', () => {
    expect(relayPriceFrame(JSON.stringify({ event: 'heartbeat', timestamp: 1 }))).toBeNull();
  });

  it('drops an unreadable body', () => {
    expect(relayPriceFrame('not json')).toBeNull();
  });

  it('drops a price frame with a non-finite price', () => {
    expect(relayPriceFrame(JSON.stringify({ event: 'price', symbol: 'XAU/USD', price: 'abc', timestamp: 1 }))).toBeNull();
  });

  it('drops a price frame with no symbol', () => {
    expect(relayPriceFrame(JSON.stringify({ event: 'price', price: 1, timestamp: 1 }))).toBeNull();
  });
});

describe('subscribeFrame', () => {
  it('names the one symbol to subscribe to', () => {
    expect(JSON.parse(subscribeFrame('XAU/USD'))).toEqual({ action: 'subscribe', params: { symbols: 'XAU/USD' } });
  });
});

describe('vendorSocketUrl', () => {
  it('carries the key only in the server-built URL', () => {
    expect(vendorSocketUrl('secret')).toBe('wss://ws.twelvedata.com/v1/quotes/price?apikey=secret');
  });
});
