// ============================================
// FEED HEALTH TESTS
// ============================================
// The robustness rules: a silent venue reads Down with the real age (never Live),
// and the reconnect backoff grows then caps.

import { describe, expect, it } from 'vitest';
import type { FeedHealth } from '../types';
import { applyMessage, backoffDelay, markDown, markReconnecting, markStale } from '../health';

function health(overrides: Partial<FeedHealth> = {}): FeedHealth {
  return {
    status: 'LIVE',
    reason: null,
    lastMessageAt: 1_000,
    lastBookAt: null,
    lastTradeAt: null,
    latencyMs: null,
    reconnectAttempt: 0,
    connectedSince: 1_000,
    staleSince: null,
    messageCount: 0,
    venue: 'Binance USDT-M XAUUSDT PERP',
    ...overrides,
  };
}

const trade = {
  kind: 'TRADE' as const,
  print: { id: 1, time: 990, price: 4000, qty: 1, buyerIsMaker: false, side: 'BUY' as const },
};

describe('applyMessage', () => {
  it('records the message time, count and trade latency', () => {
    const next = applyMessage(health({ messageCount: 4 }), trade, 1_010);
    expect(next.messageCount).toBe(5);
    expect(next.lastMessageAt).toBe(1_010);
    expect(next.lastTradeAt).toBe(1_010);
    expect(next.latencyMs).toBe(20);
    expect(next.status).toBe('LIVE');
  });

  it('brings a Down feed back to Live on a fresh message', () => {
    const next = applyMessage(health({ status: 'DOWN', reason: 'No message for 8s' }), trade, 2_000);
    expect(next.status).toBe('LIVE');
    expect(next.reason).toBeNull();
  });

  it('ignores an unreadable frame so it cannot clear a stale state', () => {
    const current = health({ status: 'DOWN', reason: 'No message for 8s' });
    const next = applyMessage(current, { kind: 'UNKNOWN' }, 2_000);
    expect(next).toBe(current);
  });
});

describe('markStale', () => {
  it('leaves a fresh feed alone', () => {
    const current = health({ lastMessageAt: 1_000 });
    expect(markStale(current, 1_000 + 4_000)).toBe(current);
  });

  it('marks the feed Down with the real age once it goes silent', () => {
    const current = health({ lastMessageAt: 1_000 });
    const next = markStale(current, 1_000 + 8_400);
    expect(next.status).toBe('DOWN');
    expect(next.staleSince).toBe(1_000);
    expect(next.reason).toBe('No message for 8s');
  });

  it('never touches a feed that is already down', () => {
    const current = health({ status: 'DOWN' });
    expect(markStale(current, 99_999_999)).toBe(current);
  });
});

describe('reconnect backoff', () => {
  it('grows with each attempt and then caps', () => {
    expect(backoffDelay(1)).toBe(1_000);
    expect(backoffDelay(2)).toBe(2_000);
    expect(backoffDelay(3)).toBe(5_000);
    expect(backoffDelay(50)).toBe(30_000);
  });

  it('records the attempt count while reconnecting', () => {
    const next = markReconnecting(health(), 3);
    expect(next.status).toBe('RECONNECTING');
    expect(next.reconnectAttempt).toBe(3);
  });

  it('carries the honest reason when it gives up', () => {
    const next = markDown(health(), 'Venue geo-blocked this region (HTTP 451)');
    expect(next.status).toBe('DOWN');
    expect(next.reason).toContain('451');
  });
});
