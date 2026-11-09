// ============================================
// SERVER ORDER FLOW ADAPTER TESTS
// ============================================
// The shipped adapter reads Alpaca, a real venue whose credentials the candle
// feed already holds. These tests lock in the configuration logic and the honest
// default: with no venue configured there is no reading, never a placeholder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowHasMarket,
  orderFlowLabel,
  resolveOrderFlowVendor,
} from '../orderflow';

const ENV_KEYS = ['ORDERFLOW_PROVIDER', 'ORDERFLOW_API_KEY', 'ALPACA_API_KEY', 'ALPACA_API_SECRET'];

describe('resolveOrderFlowVendor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('defaults to alpaca, which reuses the candle feed credentials', () => {
    expect(resolveOrderFlowVendor()).toBe('alpaca');
  });

  it('is none when explicitly switched off', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(resolveOrderFlowVendor()).toBe('none');
  });

  it('is custom for any other named provider', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(resolveOrderFlowVendor()).toBe('custom');
  });
});

describe('orderFlowConfigured', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('needs both Alpaca credentials, and is false when switched off', () => {
    expect(orderFlowConfigured()).toBe(false);
    process.env.ALPACA_API_KEY = 'kid';
    expect(orderFlowConfigured()).toBe(false);
    process.env.ALPACA_API_SECRET = 'sek';
    expect(orderFlowConfigured()).toBe(true);
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(orderFlowConfigured()).toBe(false);
  });

  it('needs both a provider and a key for a custom vendor', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(orderFlowConfigured()).toBe(false);
    process.env.ORDERFLOW_API_KEY = 'secret';
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowApiKey()).toBe('secret');
    expect(orderFlowLabel()).toBe('MyFeed');
  });

  it('labels Alpaca as the shipped venue', () => {
    expect(orderFlowLabel()).toBe('Alpaca');
  });
});

describe('orderFlowHasMarket', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('has a market for Gold and every index asset', () => {
    expect(orderFlowHasMarket('GC')).toBe(true);
    expect(orderFlowHasMarket('ES')).toBe(true);
    expect(orderFlowHasMarket('YM')).toBe(true);
    expect(orderFlowHasMarket('NQ')).toBe(true);
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

  it('returns no reading when the shipped venue has no credentials', async () => {
    await expect(
      fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: null })
    ).resolves.toBeNull();
  });
});
