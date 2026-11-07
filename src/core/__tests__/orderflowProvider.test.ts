// ============================================
// ORDER FLOW PROVIDER TESTS
// ============================================
// The right-hand compass must never show a made-up reading. These tests pin the
// two honest behaviours:
//
//   * the shipped `none` adapter has no reading at all
//   * the probe reports what the SERVER says, and a server that answers null
//     leaves the card with no reading rather than a placeholder

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeOrderFlowProvider,
  activeOrderFlowProviderId,
  clearOrderFlowCache,
  httpOrderFlowProvider,
  noneOrderFlowProvider,
  orderFlowProviderFor,
  probeOrderFlowProvider,
  type BookQuote,
} from '../providers/orderflow';
import { DEFAULT_INSTRUMENT_ID, findInstrument } from '../instruments';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const instrument = findInstrument(DEFAULT_INSTRUMENT_ID)!;

describe('noneOrderFlowProvider', () => {
  it('is never configured, so the card shows "no source"', () => {
    expect(noneOrderFlowProvider.isConfigured()).toBe(false);
  });

  it('returns no reading rather than inventing one', async () => {
    await expect(noneOrderFlowProvider.getReading({ instrument, timeframe: '15m' })).resolves.toBeNull();
  });
});

describe('orderFlowProviderFor', () => {
  it('resolves the two shipped adapters', () => {
    expect(orderFlowProviderFor('none')).toBe(noneOrderFlowProvider);
    expect(orderFlowProviderFor('http')).toBe(httpOrderFlowProvider);
  });
});

describe('probeOrderFlowProvider', () => {
  beforeEach(() => {
    clearOrderFlowCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOrderFlowCache();
  });

  it('reports no source configured when the server says so', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ configured: false, provider: 'none', label: 'None' }));

    const result = await probeOrderFlowProvider();

    expect(result.configured).toBe(false);
    expect(result.provider).toBe('none');
    expect(activeOrderFlowProviderId()).toBe('none');
    expect(activeOrderFlowProvider().isConfigured()).toBe(false);
  });

  it('reports the configured source the server names', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ configured: true, provider: 'http', label: 'MyFeed' }));

    const result = await probeOrderFlowProvider();

    expect(result).toMatchObject({ configured: true, provider: 'http', label: 'MyFeed', reachable: true });
    expect(activeOrderFlowProviderId()).toBe('http');
  });

  it('falls back to none when the route cannot be reached, rather than guessing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await probeOrderFlowProvider();

    expect(result).toMatchObject({ configured: false, provider: 'none', reachable: false });
  });

  it('reports unreachable on a non-OK status rather than treating it as configured', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({}, 500));

    const result = await probeOrderFlowProvider();

    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
  });

  it('asks the server once and reuses the answer', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return jsonResponse({ configured: false, provider: 'none' });
    });

    await probeOrderFlowProvider();
    await probeOrderFlowProvider();

    expect(calls).toBe(1);
  });
});

describe('httpOrderFlowProvider', () => {
  beforeEach(() => {
    clearOrderFlowCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOrderFlowCache();
  });

  it('returns null while no source is confirmed configured', async () => {
    await expect(httpOrderFlowProvider.getReading({ instrument, timeframe: '15m' })).resolves.toBeNull();
  });

  it('returns the server book once a source is configured', async () => {
    const book: BookQuote = {
      bid: 100.5,
      ask: 100.6,
      bidSize: 300,
      askSize: 100,
      volume: 1_000_000,
      source: 'MyFeed',
      at: 1_700_000_000_000,
    };

    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/api/orderflow/reading') && !url.includes('instrument=')) {
        return jsonResponse({ configured: true, provider: 'http', label: 'MyFeed' });
      }
      return jsonResponse({ configured: true, provider: 'http', label: 'MyFeed', book });
    });

    await probeOrderFlowProvider();
    await expect(httpOrderFlowProvider.getReading({ instrument, timeframe: '15m' })).resolves.toEqual(book);
  });

  it('treats a null book from the server as no reading, not as a zero', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (!url.includes('instrument=')) {
        return jsonResponse({ configured: true, provider: 'http', label: 'MyFeed' });
      }
      return jsonResponse({ configured: true, provider: 'http', label: 'MyFeed', book: null });
    });

    await probeOrderFlowProvider();
    await expect(httpOrderFlowProvider.getReading({ instrument, timeframe: '15m' })).resolves.toBeNull();
  });
});
