// ============================================
// SERVER ORDER FLOW ADAPTER TESTS
// ============================================
// The shipped adapter has no vendor, so its only correct answers are "not
// configured" and "no reading". These tests lock that in, and check that the
// configuration is read from the environment the deployment sets.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowLabel,
  resolveOrderFlowVendor,
} from '../orderflow';

const ENV_KEYS = ['ORDERFLOW_PROVIDER', 'ORDERFLOW_API_KEY'];

describe('resolveOrderFlowVendor', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('is none when nothing is set', () => {
    expect(resolveOrderFlowVendor()).toBe('none');
  });

  it('is none when explicitly set to none', () => {
    process.env.ORDERFLOW_PROVIDER = 'none';
    expect(resolveOrderFlowVendor()).toBe('none');
  });

  it('is custom for any named provider', () => {
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

  it('is false with no provider, and false with a provider but no key', () => {
    expect(orderFlowConfigured()).toBe(false);
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    expect(orderFlowConfigured()).toBe(false);
  });

  it('is true only with both a provider and a key', () => {
    process.env.ORDERFLOW_PROVIDER = 'MyFeed';
    process.env.ORDERFLOW_API_KEY = 'secret';
    expect(orderFlowConfigured()).toBe(true);
    expect(orderFlowApiKey()).toBe('secret');
    expect(orderFlowLabel()).toBe('MyFeed');
  });

  it('reports the label as None when nothing is configured', () => {
    expect(orderFlowLabel()).toBe('None');
  });
});

describe('fetchOrderFlowReading', () => {
  it('returns no reading, because no order-flow vendor is wired up', async () => {
    // This is the honest answer, not a placeholder. Twelve Data carries no
    // order-flow data, so a candle-derived delta would be a fabrication.
    await expect(
      fetchOrderFlowReading({ instrumentId: 'GC', timeframe: '15m', apiKey: 'secret' })
    ).resolves.toBeNull();
  });
});
