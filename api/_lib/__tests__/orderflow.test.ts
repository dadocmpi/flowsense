// ============================================
// SERVER ORDER FLOW ADAPTER TESTS
// ============================================
// Every shipped asset reads Alpaca, which needs a key. These tests lock in the
// configuration logic and the honest default: with no key configured there is no
// reading, never a placeholder. They also pin the retirement of Binance — a
// leftover `ORDERFLOW_PROVIDER=binance` must resolve to Alpaca rather than
// leaving the compass empty.

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

function setAlpacaCreds(): void {
  process.env.ALPACA_API_KEY = 'key-id';
  process.env.ALPACA_API_SECRET = 'secret-key';
}

describe('resolveOrderFlowVendor', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('defaults to alpaca, the shipped venue', () => {
    expect(resolveOrderFlowVendor()).toBe('alpaca');
  });

  it('is none when explicitly switched off', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(resolveOrderFlowVendor()).toBe('none');
  });

  it('understands alpaca as a named venue', () => {
    process.env.ORDERFLOW_PROVIDER = 'alpaca';
    expect(resolveOrderFlowVendor()).toBe('alpaca');
  });

  it('maps the retired binance venue onto alpaca rather than a custom vendor', () => {
    process.env.ORDERFLOW_PROVIDER = 'binance';
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

  it('reads every shipped asset on Alpaca by default', () => {
    expect(orderFlowVenueFor('GC')).toBe('alpaca');
    expect(orderFlowVenueFor('ES')).toBe('alpaca');
    expect(orderFlowVenueFor('YM')).toBe('alpaca');
    expect(orderFlowVenueFor('NQ')).toBe('alpaca');
  });

  it('lets a per-asset override win over the default', () => {
    process.env.ORDERFLOW_PROVIDER_ES = 'none';
    expect(orderFlowVenueFor('ES')).toBe('none');
  });

  it('lets the deployment-wide setting win over a per-asset default', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(orderFlowVenueFor('ES')).toBe('none');
    expect(orderFlowVenueFor('NQ')).toBe('none');
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

  it('is false out of the box, because Alpaca needs its key', () => {
    expect(orderFlowConfigured()).toBe(false);
    expect(orderFlowConfiguredFor('GC')).toBe(false);
    expect(orderFlowConfiguredFor('ES')).toBe(false);
  });

  it('is true for every asset once the Alpaca key is present', () => {
    setAlpacaCreds();
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowConfiguredFor('GC')).toBe(true);
    expect(orderFlowConfiguredFor('ES')).toBe(true);
    expect(orderFlowConfiguredFor('NQ')).toBe(true);
  });

  it('is false when the whole deployment is switched off', () => {
    setAlpacaCreds();
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(orderFlowConfigured()).toBe(false);
    expect(orderFlowConfiguredFor('GC')).toBe(false);
    expect(orderFlowConfiguredFor('ES')).toBe(false);
  });

  it('needs both a provider and a key for a custom vendor', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(orderFlowConfigured()).toBe(false);
    process.env.ORDERFLOW_API_KEY = 'secret';
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowApiKey()).toBe('secret');
    expect(orderFlowLabel()).toBe('MyFeed');
  });

  it('labels every shipped asset Alpaca', () => {
    expect(orderFlowLabelFor('GC')).toBe('Alpaca');
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
    process.env.ORDERFLOW_PROVIDER_ES = 'none';
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
    process.env.ORDERFLOW_PROVIDER_ES = 'none';
    await expect(
      fetchOrderFlowReading({ instrumentId: 'ES', timeframe: '15m', apiKey: null })
    ).resolves.toBeNull();
  });
});
