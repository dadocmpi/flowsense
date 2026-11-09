// ============================================
// SERVER ORDER FLOW ADAPTER TESTS
// ============================================
// The shipped adapter reads Binance, a real public venue that needs no key. These
// tests lock in the configuration logic and the honest default: with no venue
// configured there is no reading, never a placeholder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowConfiguredFor,
  orderFlowHasMarket,
  orderFlowLabel,
  orderFlowLabelFor,
  orderFlowVenueFor,
  resolveOrderFlowVendor,
} from '../orderflow';

const ENV_KEYS = [
  'ORDERFLOW_PROVIDER',
  'ORDERFLOW_API_KEY',
  'ORDERFLOW_PROVIDER_GC',
  'ORDERFLOW_PROVIDER_ES',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
];

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe('resolveOrderFlowVendor', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('defaults to binance, which needs no key', () => {
    expect(resolveOrderFlowVendor()).toBe('binance');
  });

  it('is none when explicitly switched off', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(resolveOrderFlowVendor()).toBe('none');
  });

  it('understands alpaca as a named venue', () => {
    process.env.ORDERFLOW_PROVIDER = 'alpaca';
    expect(resolveOrderFlowVendor()).toBe('alpaca');
  });

  it('is custom for any other named provider', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(resolveOrderFlowVendor()).toBe('custom');
  });
});

describe('orderFlowVenueFor', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('reads Gold on Binance and the index assets on Alpaca by default', () => {
    expect(orderFlowVenueFor('GC')).toBe('binance');
    expect(orderFlowVenueFor('ES')).toBe('alpaca');
    expect(orderFlowVenueFor('YM')).toBe('alpaca');
    expect(orderFlowVenueFor('NQ')).toBe('alpaca');
  });

  it('lets a per-asset override win over the default', () => {
    process.env.ORDERFLOW_PROVIDER_ES = 'binance';
    expect(orderFlowVenueFor('ES')).toBe('binance');
  });

  it('lets the deployment-wide setting win over a per-asset default', () => {
    process.env.ORDERFLOW_PROVIDER = 'binance';
    expect(orderFlowVenueFor('ES')).toBe('binance');
    expect(orderFlowVenueFor('NQ')).toBe('binance');
  });

  it('honours a deployment-wide none', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(orderFlowVenueFor('GC')).toBe('none');
    expect(orderFlowVenueFor('ES')).toBe('none');
  });
});

describe('orderFlowConfigured', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('is true out of the box because Gold reads Binance with no key', () => {
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowConfiguredFor('GC')).toBe(true);
  });

  it('is false when the whole deployment is switched off', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(orderFlowConfigured()).toBe(false);
    expect(orderFlowConfiguredFor('GC')).toBe(false);
    expect(orderFlowConfiguredFor('ES')).toBe(false);
  });

  it('needs Alpaca credentials for the index assets', () => {
    expect(orderFlowConfiguredFor('ES')).toBe(false);
    process.env.ALPACA_API_KEY = 'key';
    process.env.ALPACA_API_SECRET = 'secret';
    expect(orderFlowConfiguredFor('ES')).toBe(true);
    // Gold is still Binance, unaffected by the Alpaca key.
    expect(orderFlowConfiguredFor('GC')).toBe(true);
  });

  it('needs both a provider and a key for a custom vendor', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(orderFlowConfigured()).toBe(false);
    process.env.ORDERFLOW_API_KEY = 'secret';
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowApiKey()).toBe('secret');
    expect(orderFlowLabel()).toBe('MyFeed');
  });

  it('labels each venue by asset', () => {
    expect(orderFlowLabelFor('GC')).toBe('Binance');
    expect(orderFlowLabelFor('ES')).toBe('Alpaca');
  });
});

describe('orderFlowHasMarket', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('has a real market for every shipped asset', () => {
    expect(orderFlowHasMarket('GC')).toBe(true);
    expect(orderFlowHasMarket('ES')).toBe(true);
    expect(orderFlowHasMarket('YM')).toBe(true);
    expect(orderFlowHasMarket('NQ')).toBe(true);
  });

  it('has no market when an asset is pinned to a venue that lacks one', () => {
    // Force an index asset onto Binance, which has no SPY market.
    process.env.ORDERFLOW_PROVIDER_ES = 'binance';
    expect(orderFlowHasMarket('ES')).toBe(false);
  });
});

describe('fetchOrderFlowReading', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('returns no reading for a custom vendor with no implementation', async () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    process.env.ORDERFLOW_API_KEY = 'secret';
    await expect(
      fetchOrderFlowReading({ instrumentId: 'GC', timeframe: '15m', apiKey: 'secret' })
    ).resolves.toBeNull();
  });

  it('refuses to read Alpaca without credentials rather than inventing one', async () => {
    await expect(
      fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: null, keyId: null, secretKey: null })
    ).rejects.toThrow(/credentials/i);
  });

  it('returns no reading for an instrument whose venue has no market', async () => {
    // An index asset pinned to Binance has no market there.
    process.env.ORDERFLOW_PROVIDER_ES = 'binance';
    await expect(
      fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: null })
    ).resolves.toBeNull();
  });
});
