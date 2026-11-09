// ============================================
// ALPACA ORDER FLOW ADAPTER TESTS
// ============================================
// The adapter turns two real Alpaca payloads — a trade tape and the top-of-book
// quote — into an order-flow reading. Alpaca publishes no aggressor flag, so the
// side is inferred from the tick rule plus the quote rule; these tests pin that
// inference and the maths on hand-computed inputs, and the honest behaviour: an
// instrument with no market returns null, and an empty tape is no reading.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alpacaOrderFlowHasMarket,
  alpacaOrderFlowSymbolFor,
  buildAlpacaGauge,
  computeAlpacaFlowMetrics,
  fetchAlpacaOrderFlowReading,
  type AlpacaQuote,
} from '../alpacaOrderFlow';
import { resetAlpacaMeter } from '../alpacaMeter';

const ENV_KEYS = ['ALPACA_ORDERFLOW_SYMBOL_GC', 'ALPACA_ORDERFLOW_SYMBOL_ES'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('alpacaOrderFlowSymbolFor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('maps every shipped asset to its liquid proxy', () => {
    expect(alpacaOrderFlowSymbolFor('GC')).toBe('GLD');
    expect(alpacaOrderFlowSymbolFor('ES')).toBe('SPY');
    expect(alpacaOrderFlowSymbolFor('YM')).toBe('DIA');
    expect(alpacaOrderFlowSymbolFor('NQ')).toBe('QQQ');
    expect(alpacaOrderFlowHasMarket('ES')).toBe(true);
    expect(alpacaOrderFlowSymbolFor('ZZ')).toBeNull();
    expect(alpacaOrderFlowHasMarket('ZZ')).toBe(false);
  });

  it('honours an env override', () => {
    process.env.ALPACA_ORDERFLOW_SYMBOL_GC = 'iau';
    expect(alpacaOrderFlowSymbolFor('GC')).toBe('IAU');
  });
});

describe('computeAlpacaFlowMetrics', () => {
  it('reads the book imbalance from the real top-of-book sizes', () => {
    const quote: AlpacaQuote = { bp: 100, bs: 3, ap: 101, as: 1, t: '2024-01-02T14:30:00Z' };
    const metrics = computeAlpacaFlowMetrics(quote, []);
    expect(metrics.imbalance).toBeCloseTo(0.5, 6); // (3 - 1) / (3 + 1)
    expect(metrics.delta).toBe(0);
    expect(metrics.totalVolume).toBe(0);
  });

  it('infers the aggressor from the tick rule and the real quote', () => {
    const quote: AlpacaQuote = { bp: 100, bs: 1, ap: 101, as: 1, t: '2024-01-02T14:30:00Z' };
    const trades = [
      { p: 101, s: 3, t: '2024-01-02T14:30:00Z' }, // first trade at the ask -> BUY
      { p: 100, s: 1, t: '2024-01-02T14:30:01Z' }, // below the previous price -> SELL
    ];
    const metrics = computeAlpacaFlowMetrics(quote, trades);
    expect(metrics.delta).toBeCloseTo(2, 6); // 3 buy - 1 sell
    expect(metrics.cvd).toBeCloseTo(2, 6);
    expect(metrics.totalVolume).toBe(4);
    expect(metrics.tradeCount).toBe(2);
  });

  it('uses the quote rule to break a flat-tick tie', () => {
    const quote: AlpacaQuote = { bp: 100, bs: 1, ap: 101, as: 1, t: '2024-01-02T14:30:00Z' };
    const trades = [
      { p: 101, s: 2, t: '2024-01-02T14:30:00Z' },
      { p: 101, s: 2, t: '2024-01-02T14:30:01Z' }, // flat tick at the ask -> BUY
    ];
    const metrics = computeAlpacaFlowMetrics(quote, trades);
    expect(metrics.delta).toBeCloseTo(4, 6);
    expect(metrics.totalVolume).toBe(4);
  });

  it('carries the previous side for a trade no rule can place, rather than inventing one', () => {
    const trades = [
      { p: 100, s: 1, t: '2024-01-02T14:30:00Z' }, // no quote, first trade -> unclassified
      { p: 101, s: 2, t: '2024-01-02T14:30:01Z' }, // above the previous price -> BUY
    ];
    const metrics = computeAlpacaFlowMetrics(null, trades);
    expect(metrics.delta).toBeCloseTo(2, 6);
    expect(metrics.totalVolume).toBe(2);
    expect(metrics.imbalance).toBe(0);
  });

  it('reports a balanced book and zero delta for an empty tape', () => {
    const metrics = computeAlpacaFlowMetrics(null, []);
    expect(metrics.imbalance).toBe(0);
    expect(metrics.delta).toBe(0);
    expect(metrics.absorption).toBe(0);
  });
});

describe('buildAlpacaGauge', () => {
  it('blends the tape delta and the book into the -100..+100 scale', () => {
    const gauge = buildAlpacaGauge({
      delta: 2,
      cvd: 2,
      imbalance: 0.5,
      absorption: 1,
      tradeCount: 2,
      totalVolume: 4,
    });
    // 100 * (0.6 * 0.5 + 0.4 * 0.5) = 50
    expect(gauge.score).toBeCloseTo(50, 6);
    expect(gauge.label).toBe('BUY');
  });

  it('never lets a label disagree with its score', () => {
    const bearish = buildAlpacaGauge({
      delta: -4,
      cvd: -4,
      imbalance: -1,
      absorption: 0,
      tradeCount: 3,
      totalVolume: 4,
    });
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

  it('returns no reading for an instrument with no Alpaca market', async () => {
    await expect(
      fetchAlpacaOrderFlowReading({ instrumentId: 'ZZ', keyId: 'kid', secretKey: 'sek' })
    ).resolves.toBeNull();
  });

  it('reads the tape and the quote and returns a real reading', async () => {
    const trades = {
      trades: { SPY: [{ p: 101, s: 3, t: '2024-01-02T14:30:00Z' }, { p: 100, s: 1, t: '2024-01-02T14:30:01Z' }] },
      next_page_token: null,
    };
    const quotes = {
      quotes: { SPY: [{ bp: 100, bs: 3, ap: 101, as: 1, t: '2024-01-02T14:30:02Z' }] },
      next_page_token: null,
    };
    vi.stubGlobal('fetch', async (url: string) =>
      jsonResponse(url.includes('/trades') ? trades : quotes)
    );

    const reading = await fetchAlpacaOrderFlowReading({ instrumentId: 'ES', keyId: 'kid', secretKey: 'sek' });

    expect(reading).not.toBeNull();
    expect(reading?.metrics.delta).toBeCloseTo(2, 6);
    expect(reading?.metrics.imbalance).toBeCloseTo(0.5, 6);
    expect(reading?.source).toContain('Alpaca');
    expect(reading?.source).toContain('SPY');
  });

  it('returns no reading when the tape is empty', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      jsonResponse(url.includes('/trades') ? { trades: { SPY: [] } } : { quotes: { SPY: [] } })
    );
    await expect(
      fetchAlpacaOrderFlowReading({ instrumentId: 'ES', keyId: 'kid', secretKey: 'sek' })
    ).resolves.toBeNull();
  });

  it('classifies an auth failure in our own terms', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({ message: 'invalid credentials supplied' }, 401)
    );
    await expect(
      fetchAlpacaOrderFlowReading({ instrumentId: 'ES', keyId: 'bad', secretKey: 'bad' })
    ).rejects.toMatchObject({ kind: 'AUTH' });
  });
});
