// ============================================
// ALPACA ORDER FLOW ADAPTER TESTS
// ============================================
// The adapter turns two real Alpaca payloads — the tape and the top of book — into an
// order-flow reading. A stock print carries no aggressor side, so the side is
// classified with the tick rule; these tests pin that maths on hand-computed
// inputs, and the honest behaviours:
//
//   * an instrument Alpaca does not serve returns null
//   * a tape with no prints and no quote returns null, not a zeroed reading
//   * the tick rule never invents a side it cannot infer

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alpacaFlowSymbolFor,
  alpacaHasMarket,
  buildAlpacaGauge,
  computeAlpacaFlowMetrics,
  fetchAlpacaOrderFlowReading,
  type AlpacaFlowMetrics,
} from '../alpacaOrderflow';
import { resetAlpacaMeter } from '../alpacaMeter';
import type { AlpacaQuote, AlpacaTrade } from '../alpaca';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ENV_KEYS = ['ASSET_PROVIDER_ES', 'ASSET_SYMBOL_ES', 'ORDERFLOW_PROVIDER'];

describe('alpacaFlowSymbolFor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('maps the index assets to their ETF proxies and Gold to none', () => {
    expect(alpacaFlowSymbolFor('ES')).toBe('SPY');
    expect(alpacaFlowSymbolFor('YM')).toBe('DIA');
    expect(alpacaFlowSymbolFor('NQ')).toBe('QQQ');
    expect(alpacaFlowSymbolFor('GC')).toBeNull();
    expect(alpacaHasMarket('ES')).toBe(true);
    expect(alpacaHasMarket('GC')).toBe(false);
  });
});

describe('computeAlpacaFlowMetrics', () => {
  it('classifies prints with the tick rule and reads the top-of-book imbalance', () => {
    const quote: AlpacaQuote = { t: '2024-06-10T13:30:00Z', bp: 100, bs: 3, ap: 101, as: 1 };
    // mid = 100.5. 101 > mid -> BUY; 102 > 101 -> BUY; 101 < 102 -> SELL.
    const trades: AlpacaTrade[] = [
      { t: '2024-06-10T13:30:01Z', p: 101, s: 1 },
      { t: '2024-06-10T13:30:02Z', p: 102, s: 1 },
      { t: '2024-06-10T13:30:03Z', p: 101, s: 1 },
    ];

    const metrics = computeAlpacaFlowMetrics(trades, quote);

    expect(metrics.delta).toBeCloseTo(1, 6); // buy 2 - sell 1
    expect(metrics.cvd).toBeCloseTo(1, 6);
    expect(metrics.imbalance).toBeCloseTo(0.5, 6); // (3 - 1) / (3 + 1)
    expect(metrics.tradeCount).toBe(3);
    expect(metrics.classifiedTrades).toBe(3);
  });

  it('carries the previous side through an unchanged price', () => {
    const quote: AlpacaQuote = { t: 'x', bp: 100, bs: 1, ap: 101, as: 1 };
    // mid = 100.5. First print 100 < mid -> SELL; the second at the same price
    // carries that side rather than being guessed again.
    const trades: AlpacaTrade[] = [
      { t: '2024-06-10T13:30:01Z', p: 100, s: 1 },
      { t: '2024-06-10T13:30:02Z', p: 100, s: 1 },
    ];

    const metrics = computeAlpacaFlowMetrics(trades, quote);

    expect(metrics.delta).toBeCloseTo(-2, 6); // two sells, no buys
    expect(metrics.classifiedTrades).toBe(2);
  });

  it('leaves the first print unclassified with no predecessor and no quote', () => {
    const trades: AlpacaTrade[] = [{ t: '2024-06-10T13:30:01Z', p: 100, s: 5 }];

    const metrics = computeAlpacaFlowMetrics(trades, null);

    expect(metrics.delta).toBe(0);
    expect(metrics.imbalance).toBe(0);
    expect(metrics.classifiedTrades).toBe(0);
  });

  it('reports a balanced book and zero delta for an empty tape', () => {
    const metrics = computeAlpacaFlowMetrics([], null);
    expect(metrics.imbalance).toBe(0);
    expect(metrics.delta).toBe(0);
    expect(metrics.absorption).toBe(0);
  });
});

describe('buildAlpacaGauge', () => {
  const base: AlpacaFlowMetrics = { delta: 0, cvd: 0, imbalance: 0, absorption: 0, tradeCount: 0, classifiedTrades: 0 };

  it('blends the tape delta and the top of book into the -100..+100 scale', () => {
    const gauge = buildAlpacaGauge({ ...base, delta: 2, cvd: 2, imbalance: 0.5 }, 4);
    // 100 * (0.6 * 0.5 + 0.4 * 0.5) = 50
    expect(gauge.score).toBeCloseTo(50, 6);
    expect(gauge.label).toBe('BUY');
  });

  it('never lets a label disagree with its score', () => {
    const bearish = buildAlpacaGauge({ ...base, delta: -4, cvd: -4, imbalance: -1 }, 4);
    expect(bearish.score).toBeCloseTo(-100, 6);
    expect(bearish.label).toBe('STRONG_SELL');
  });
});

describe('fetchAlpacaOrderFlowReading', () => {
  beforeEach(() => {
    resetAlpacaMeter();
    for (const key of ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns no reading for an instrument Alpaca does not serve', async () => {
    await expect(fetchAlpacaOrderFlowReading('GC', '15m', 'k', 's')).resolves.toBeNull();
  });

  it('reads the tape and the top of book and returns a real reading', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/v2/stocks/trades')) {
        return jsonResponse({
          trades: {
            SPY: [
              { t: '2024-06-10T13:30:01Z', p: 101, s: 1, x: 'V' },
              { t: '2024-06-10T13:30:02Z', p: 102, s: 1, x: 'V' },
              { t: '2024-06-10T13:30:03Z', p: 101, s: 1, x: 'V' },
            ],
          },
          next_page_token: null,
        });
      }
      return jsonResponse({ quotes: { SPY: { t: '2024-06-10T13:30:00Z', bp: 100, bs: 3, ap: 101, as: 1 } } });
    });

    const reading = await fetchAlpacaOrderFlowReading('ES', '15m', 'key', 'secret');

    expect(reading).not.toBeNull();
    expect(reading?.metrics.delta).toBeCloseTo(1, 6);
    expect(reading?.metrics.imbalance).toBeCloseTo(0.5, 6);
    expect(reading?.source).toContain('Alpaca');
    expect(reading?.source).toContain('SPY');
    expect(reading?.source).toContain('IEX');
  });

  it('returns no reading when the tape is empty and no quote came back', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/v2/stocks/trades') ? jsonResponse({ trades: { SPY: [] } }) : jsonResponse({ quotes: {} })
    );

    await expect(fetchAlpacaOrderFlowReading('ES', '15m', 'key', 'secret')).resolves.toBeNull();
  });
});
