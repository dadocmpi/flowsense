// ============================================
// TWELVE DATA WEBSOCKET PARSING TESTS
// ============================================

import { describe, expect, it } from 'vitest';
import { isEntitlementFailure, parseWsMessage } from '../providers/twelvedataWs';

describe('parseWsMessage', () => {
  it('parses a price frame and converts seconds to milliseconds', () => {
    const parsed = parseWsMessage(JSON.stringify({ event: 'price', symbol: 'XAU/USD', price: 2330.5, timestamp: 1718 }));
    expect(parsed.kind).toBe('PRICE');
    if (parsed.kind !== 'PRICE') return;
    expect(parsed.message.price).toBe(2330.5);
    expect(parsed.message.timestamp).toBe(1_718_000);
  });

  it('accepts a numeric price sent as a string', () => {
    const parsed = parseWsMessage(JSON.stringify({ event: 'price', symbol: 'ES1!', price: '5210.25', timestamp: 1718 }));
    expect(parsed.kind).toBe('PRICE');
    if (parsed.kind !== 'PRICE') return;
    expect(parsed.message.price).toBe(5210.25);
  });

  it('treats an unreadable frame as UNKNOWN rather than throwing', () => {
    expect(parseWsMessage('not json').kind).toBe('UNKNOWN');
    expect(parseWsMessage('[]').kind).toBe('UNKNOWN');
  });

  it('rejects a price frame missing its symbol', () => {
    expect(parseWsMessage(JSON.stringify({ event: 'price', price: 10, timestamp: 1 })).kind).toBe('UNKNOWN');
  });

  it('reports a successful subscribe-status as ok', () => {
    const parsed = parseWsMessage(JSON.stringify({ event: 'subscribe-status', status: 'ok' }));
    expect(parsed.kind).toBe('STATUS');
    if (parsed.kind !== 'STATUS') return;
    expect(parsed.ok).toBe(true);
  });

  it('reports a failed subscribe-status with the vendor detail', () => {
    const parsed = parseWsMessage(
      JSON.stringify({ event: 'subscribe-status', status: 'error', fails: [{ symbol: 'ES1!', message: 'not entitled' }] })
    );
    expect(parsed.kind).toBe('STATUS');
    if (parsed.kind !== 'STATUS') return;
    expect(parsed.ok).toBe(false);
    expect(parsed.detail).toBe('not entitled');
  });
});

describe('isEntitlementFailure', () => {
  it('recognises wording that means "stop trying the socket"', () => {
    expect(isEntitlementFailure('not entitled to this symbol')).toBe(true);
    expect(isEntitlementFailure('upgrade your subscription')).toBe(true);
    expect(isEntitlementFailure('forbidden')).toBe(true);
  });

  it('returns false for an unrelated failure', () => {
    expect(isEntitlementFailure('temporary network error')).toBe(false);
    expect(isEntitlementFailure(undefined)).toBe(false);
  });
});
