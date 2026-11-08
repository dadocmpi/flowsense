// ============================================
// BINANCE ORDER FLOW ADAPTER TESTS
// ============================================
// The adapter turns two real Binance payloads — a depth snapshot and an
// aggTrades window — into an order-flow reading. These tests pin the maths on
// hand-computed inputs, and the honest behaviour: an instrument with no market
// returns null, and a geo-restricted host falls through to the next one.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  binanceHasMarket,
  binanceSymbolFor,
  buildBinanceGauge,
  computeBinanceFlowMetrics,
  fetchBinanceOrderFlowReading,
  resetBinanceBase,
  type DepthPayload,
} from '../binance';
import { resetBinanceMeter } from '../binanceMeter';

const ENV_KEYS = ['BINANCE_BASE_URL', 'BINANCE_SYMBOL_GC', 'BINANCE_SYMBOL_ES'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('binanceSymbolFor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('maps Gold to the PAXG/USDT market and has none for an index asset', () => {
    expect(binanceSymbolFor('GC')).toBe('PAXGUSDT');
    expect(binanceHasMarket('GC')).toBe(true);
    expect(binanceSymbolFor('ES')).toBeNull();
    expect(binanceHasMarket('ES')).toBe(false);
  });

  it('honours an env override', () => {
    process.env.BINANCE_SYMBOL_GC = 'xautusdt';
    expect(binanceSymbolFor('GC')).toBe('XAUTUSDT');
  });
});

describe('computeBinanceFlowMetrics', () => {
  it('reads the book imbalance and the aggressor delta from real payloads', () => {
    const depth: DepthPayload = { bids: [['100', '3']], asks: [['101', '1']] };
    // m:false -> buyer aggressed (buy); m:true -> seller aggressed (sell).
    const trades = [
      { p: '100', q: '3', m: false },
      { p: '100', q: '1', m: true },
    ];

    const metrics = computeBinanceFlowMetrics(depth, trades);

    expect(metrics.imbalance).toBeCloseTo(0.5, 6); // (3 - 1) / (3 + 1)
    expect(metrics.delta).toBeCloseTo(2, 6); // 3 buy - 1 sell
    expect(metrics.cvd).toBeCloseTo(2, 6);
    expect(metrics.tradeCount).toBe(2);
    // Net flow was strong and the price did not move, so it was fully absorbed.
    expect(metrics.absorption).toBeCloseTo(1, 6);
  });

  it('reports a balanced book and zero delta for an empty tape', () => {
    const metrics = computeBinanceFlowMetrics({ bids: [], asks: [] }, []);
    expect(metrics.imbalance).toBe(0);
    expect(metrics.delta).toBe(0);
    expect(metrics.absorption).toBe(0);
  });
});

describe('buildBinanceGauge', () => {
  it('blends the tape delta and the book into the -100..+100 scale', () => {
    const gauge = buildBinanceGauge(
      { delta: 2, cvd: 2, imbalance: 0.5, absorption: 1, tradeCount: 2, buyVolume: 3, sellVolume: 1, lastTradeAt: null },
      4
    );
    // 100 * (0.6 * 0.5 + 0.4 * 0.5) = 50
    expect(gauge.score).toBeCloseTo(50, 6);
    expect(gauge.label).toBe('BUY');
  });

  it('never lets a label disagree with its score', () => {
    const bearish = buildBinanceGauge(
      { delta: -4, cvd: -4, imbalance: -1, absorption: 0, tradeCount: 3, buyVolume: 0, sellVolume: 4, lastTradeAt: null },
      4
    );
    expect(bearish.score).toBeCloseTo(-100, 6);
    expect(bearish.label).toBe('STRONG_SELL');
  });
});

describe('fetchBinanceOrderFlowReading', () => {
  beforeEach(() => {
    resetBinanceBase();
    resetBinanceMeter();
    for (const key of ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns no reading for an instrument with no Binance market', async () => {
    await expect(fetchBinanceOrderFlowReading('ES', '15m')).resolves.toBeNull();
  });

  it('reads the depth and the tape and returns a real reading', async () => {
    const depth = { bids: [['100', '3']], asks: [['101', '1']] };
    const trades = [
      { p: '100', q: '3', m: false },
      { p: '100', q: '1', m: true },
    ];
    vi.stubGlobal('fetch', async (url: string) =>
      jsonResponse(url.includes('/depth') ? depth : trades)
    );

    const reading = await fetchBinanceOrderFlowReading('GC', '15m');

    expect(reading).not.toBeNull();
    expect(reading?.metrics.delta).toBeCloseTo(2, 6);
    expect(reading?.metrics.imbalance).toBeCloseTo(0.5, 6);
    expect(reading?.source).toContain('Binance');
    expect(reading?.source).toContain('PAXGUSDT');
  });

  it('falls through a geo-restricted host to the next one', async () => {
    const depth = { bids: [['100', '3']], asks: [['101', '1']] };
    const trades = [{ p: '100', q: '1', m: false }];
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      // The primary host is restricted; the second answers.
      if (url.includes('data-api.binance.vision')) return jsonResponse({ code: 0, msg: 'restricted' }, 451);
      return jsonResponse(url.includes('/depth') ? depth : trades);
    });

    const reading = await fetchBinanceOrderFlowReading('GC', '15m');

    expect(reading).not.toBeNull();
    expect(seen.some(url => url.includes('api.binance.us'))).toBe(true);
  });

  it('throws a GEO_BLOCKED error when every host is restricted', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ code: 0, msg: 'restricted' }, 451));

    await expect(fetchBinanceOrderFlowReading('GC', '15m')).rejects.toMatchObject({ kind: 'GEO_BLOCKED' });
  });
});
