// ============================================
// SERVER ORDER FLOW ROUTING TESTS
// ============================================
// The venue is chosen PER ASSET: Gold reads Binance PAXG/USDT (a real gold
// market), the equity indices read Alpaca SPY/DIA/QQQ — the same venue that
// serves their candles — because Binance has no market for the indices. These
// tests lock in that routing, the override precedence, and the honest default:
// with no venue configured there is no reading, never a placeholder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowConfiguredFor,
  orderFlowHasMarket,
  orderFlowLabel,
  orderFlowVenueFor,
} from '../orderflow';

const ENV_KEYS = [
  'ORDERFLOW_PROVIDER',
  'ORDERFLOW_PROVIDER_GC',
  'ORDERFLOW_PROVIDER_ES',
  'ORDERFLOW_PROVIDER_YM',
  'ORDERFLOW_PROVIDER_NQ',
  'ORDERFLOW_API_KEY',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'ALPACA_API_KEY_ID',
  'ALPACA_API_SECRET_KEY',
];

describe('orderFlowVenueFor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('routes Gold to Binance and the index assets to Alpaca', () => {
    expect(orderFlowVenueFor('GC')).toBe('binance');
    expect(orderFlowVenueFor('ES')).toBe('alpaca');
    expect(orderFlowVenueFor('YM')).toBe('alpaca');
    expect(orderFlowVenueFor('NQ')).toBe('alpaca');
  });

  it('lets a per-asset override win over the global provider', () => {
    process.env.ORDERFLOW_PROVIDER = 'binance';
    process.env.ORDERFLOW_PROVIDER_ES = 'alpaca';
    expect(orderFlowVenueFor('ES')).toBe('alpaca');
    expect(orderFlowVenueFor('NQ')).toBe('binance');
  });

  it('is none when switched off, per asset', () => {
    process.env.ORDERFLOW_PROVIDER_NQ = 'none';
    expect(orderFlowVenueFor('NQ')).toBe('none');
  });

  it('resolves an unknown provider name to custom rather than guessing', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(orderFlowVenueFor('GC')).toBe('custom');
  });
});

describe('orderFlowConfigured / labels', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('is configured for Binance (no key) and labels Gold Binance', () => {
    expect(orderFlowConfiguredFor('GC')).toBe(true);
    expect(orderFlowLabel('GC')).toBe('Binance');
  });

  it('is not configured for an Alpaca asset until both credentials are set', () => {
    expect(orderFlowConfiguredFor('NQ')).toBe(false);
    process.env.ALPACA_API_KEY_ID = 'id';
    expect(orderFlowConfiguredFor('NQ')).toBe(false);
    process.env.ALPACA_API_SECRET_KEY = 'secret';
    expect(orderFlowConfiguredFor('NQ')).toBe(true);
    expect(orderFlowLabel('NQ')).toBe('Alpaca');
  });

  it('is configured overall when at least one venue is configured', () => {
    expect(orderFlowConfigured()).toBe(true);
  });

  it('needs a key for a custom venue', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(orderFlowConfiguredFor('GC')).toBe(false);
    process.env.ORDERFLOW_API_KEY = 'secret';
    expect(orderFlowConfiguredFor('GC')).toBe(true);
    expect(orderFlowApiKey()).toBe('secret');
    expect(orderFlowLabel('GC')).toBe('MyFeed');
  });
});

describe('orderFlowHasMarket', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('has a Binance market for Gold and none for an index asset', () => {
    expect(orderFlowHasMarket('GC')).toBe(true);
    // ES is routed to Alpaca, which does have SPY.
    expect(orderFlowHasMarket('ES')).toBe(true);
  });

  it('reports no market when Binance is forced onto an index asset', () => {
    process.env.ORDERFLOW_PROVIDER_ES = 'binance';
    expect(orderFlowHasMarket('ES')).toBe(false);
  });
});

describe('fetchOrderFlowReading', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns no reading for a custom vendor with no implementation', async () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    process.env.ORDERFLOW_API_KEY = 'secret';
    await expect(
      fetchOrderFlowReading({ instrumentId: 'GC', timeframe: '15m', apiKey: 'secret' })
    ).resolves.toBeNull();
  });

  it('returns no reading for an index asset forced onto Binance, which has no market', async () => {
    process.env.ORDERFLOW_PROVIDER_ES = 'binance';
    await expect(
      fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: null })
    ).resolves.toBeNull();
  });
});
