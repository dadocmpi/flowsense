// ============================================
// HEALTH ROUTE TESTS
// ============================================
// /api/health must cost no vendor calls: it reads configuration and the
// in-memory meters only. These tests lock that in, and check that the Alpaca
// status the task asks for is present (credentials OK, last call time, calls this
// minute) and that no key value is ever echoed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../health';
import { resetCreditMeter } from '../creditMeter';
import { resetAlpacaMeter } from '../alpacaMeter';

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
    },
    setHeader() {
      /* no-op */
    },
    end() {
      /* no-op */
    },
  };
  return { res, captured };
}

interface HealthBody {
  ok: boolean;
  providers: {
    twelvedata: { configured: boolean; hasKey: boolean };
    alpaca: {
      configured: boolean;
      hasKeyId: boolean;
      hasSecret: boolean;
      requestsPerMinute: number;
      callsThisMinute: number;
      lastCallAt: number | null;
    };
  };
  assets: Array<{ instrumentId: string; provider: string; symbol: string }>;
}

const ENV_KEYS = ['TWELVE_DATA_API_KEY', 'FUTURES_API_KEY', 'ALPACA_API_KEY', 'ALPACA_API_SECRET'];

describe('GET /api/health', () => {
  beforeEach(() => {
    resetCreditMeter();
    resetAlpacaMeter();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('makes no vendor call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { res } = makeRes();
    handler({ method: 'GET', query: {} }, res);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports each provider as unconfigured when no key is set', async () => {
    const { res, captured } = makeRes();
    handler({ method: 'GET', query: {} }, res);

    const body = captured.body as HealthBody;
    expect(body.ok).toBe(true);
    expect(body.providers.twelvedata.configured).toBe(false);
    expect(body.providers.alpaca.configured).toBe(false);
    expect(body.providers.alpaca.hasKeyId).toBe(false);
    expect(body.providers.alpaca.hasSecret).toBe(false);
  });

  it('reports Alpaca configured with credentials OK, last call time and calls this minute', async () => {
    process.env.ALPACA_API_KEY = 'kid';
    process.env.ALPACA_API_SECRET = 'sek';

    const { res, captured } = makeRes();
    handler({ method: 'GET', query: {} }, res);

    const alpaca = (captured.body as HealthBody).providers.alpaca;
    expect(alpaca.configured).toBe(true);
    expect(alpaca.hasKeyId).toBe(true);
    expect(alpaca.hasSecret).toBe(true);
    expect(alpaca).toHaveProperty('lastCallAt');
    expect(alpaca).toHaveProperty('callsThisMinute');
    expect(alpaca.requestsPerMinute).toBeGreaterThan(0);
  });

  it('never echoes a key value', async () => {
    process.env.TWELVE_DATA_API_KEY = 'super-secret-twelve';
    process.env.ALPACA_API_KEY = 'super-secret-alpaca-id';
    process.env.ALPACA_API_SECRET = 'super-secret-alpaca-secret';

    const { res, captured } = makeRes();
    handler({ method: 'GET', query: {} }, res);

    const serialized = JSON.stringify(captured.body);
    expect(serialized).not.toContain('super-secret');
  });

  it('reports the per-asset provider and symbol', async () => {
    const { res, captured } = makeRes();
    handler({ method: 'GET', query: {} }, res);

    const assets = (captured.body as HealthBody).assets;
    expect(assets.find(a => a.instrumentId === 'GC')).toMatchObject({ provider: 'twelvedata', symbol: 'XAU/USD' });
    expect(assets.find(a => a.instrumentId === 'ES')).toMatchObject({ provider: 'alpaca', symbol: 'SPY' });
  });
});
