// ============================================
// TWELVE DATA PROXY CORE
// ============================================
// Shared by the Vercel serverless function (api/twelvedata.ts) and the Vite
// dev middleware. The API key never leaves the server: the browser only ever
// talks to /api/twelvedata.

export interface ProxyResult {
  status: number;
  body: unknown;
  cacheSeconds: number;
}

export interface ProxyRequest {
  endpoint: string;
  params: Record<string, string>;
  apiKey: string | undefined;
}

const UPSTREAM_BASE = 'https://api.twelvedata.com';
const UPSTREAM_TIMEOUT_MS = 12_000;

// Only these upstream endpoints may be reached through the proxy.
const ALLOWED_ENDPOINTS = new Set(['time_series', 'quote', 'price', 'exchange_rate']);

// Only these query parameters are forwarded upstream.
const ALLOWED_PARAMS = new Set([
  'symbol',
  'symbols',
  'interval',
  'outputsize',
  'order',
  'timezone',
  'start_date',
  'end_date',
  'date',
  'format',
  'dp',
  'previous_close',
  'exchange',
  'type',
  'currency',
]);

// Must start and end alphanumeric: allows EUR/USD, BTC/USD, BRK.B, AAPL
// while rejecting junk like "BAD!!" or "EUR/".
const SYMBOL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/:-]{0,30}[A-Za-z0-9])?$/;

// Intervals accepted by Twelve Data. Anything else is rejected before the
// request is built so junk never reaches the upstream API.
const ALLOWED_INTERVALS = new Set([
  '1min', '5min', '15min', '30min', '45min',
  '1h', '2h', '4h', '8h',
  '1day', '1week', '1month',
]);

const CACHE_TTL_SECONDS: Record<string, number> = {
  time_series: 20,
  quote: 8,
  price: 8,
  exchange_rate: 60,
};

interface CacheEntry {
  expiresAt: number;
  status: number;
  body: unknown;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

function readCache(key: string): CacheEntry | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit;
}

function writeCache(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, entry);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSymbol(raw: string): string | null {
  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0 || symbols.length > 8) return null;
  for (const symbol of symbols) {
    if (!SYMBOL_PATTERN.test(symbol)) return null;
  }
  return symbols.join(',');
}

export function buildUpstreamQuery(endpoint: string, params: Record<string, string>): string | null {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_PARAMS.has(key)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;

    if (key === 'symbol' || key === 'symbols') {
      const validated = validateSymbol(value);
      if (!validated) return null;
      query.set(key, validated);
      continue;
    }

    if (key === 'interval') {
      if (!ALLOWED_INTERVALS.has(value)) return null;
      query.set(key, value);
      continue;
    }

    if (key === 'outputsize') {
      const size = Number.parseInt(value, 10);
      if (!Number.isFinite(size) || size < 1 || size > 5000) return null;
      query.set(key, String(size));
      continue;
    }

    query.set(key, value);
  }

  if (!query.has('symbol') && !query.has('symbols') && endpoint !== 'exchange_rate') {
    return null;
  }

  return query.toString();
}

function mapUpstreamError(payload: Record<string, unknown>, httpStatus?: number): ProxyResult {
  const code = Number(payload.code ?? httpStatus);
  const message = typeof payload.message === 'string' ? payload.message : 'Twelve Data request failed';

  // 401 means the key itself is wrong; 403 means the key is valid but the plan
  // does not cover the symbol. The UI shows these differently.
  const status = code === 429 ? 429 : code === 401 || httpStatus === 401 ? 401 : code === 403 || httpStatus === 403 ? 403 : code >= 400 && code < 600 ? code : 502;
  return { status, body: { status: 'error', code, message }, cacheSeconds: 0 };
}

export async function handleTwelveDataRequest(request: ProxyRequest): Promise<ProxyResult> {
  const { endpoint, params, apiKey } = request;

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return { status: 400, body: { status: 'error', message: `Endpoint "${endpoint}" is not allowed` }, cacheSeconds: 0 };
  }

  const query = buildUpstreamQuery(endpoint, params);
  if (!query) {
    return { status: 400, body: { status: 'error', message: 'Invalid or missing query parameters' }, cacheSeconds: 0 };
  }

  if (!apiKey) {
    return {
      status: 503,
      body: {
        status: 'error',
        code: 'MISSING_API_KEY',
        message: 'TWELVEDATA_API_KEY is not configured on the server. Add it to your environment variables.',
      },
      cacheSeconds: 0,
    };
  }

  const cacheKey = `${endpoint}?${query}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return { status: cached.status, body: cached.body, cacheSeconds: CACHE_TTL_SECONDS[endpoint] ?? 10 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${UPSTREAM_BASE}/${endpoint}?${query}&apikey=${encodeURIComponent(apiKey)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const payload: unknown = await response.json();

    // Twelve Data can return HTTP 200 with an error body, or a non-2xx status
    // with the same shape. Normalise both through one mapper.
    if (isPlainObject(payload) && payload.status === 'error') {
      return mapUpstreamError(payload, response.status);
    }

    if (!response.ok) {
      return { status: response.status, body: payload, cacheSeconds: 0 };
    }

    const ttl = CACHE_TTL_SECONDS[endpoint] ?? 10;
    writeCache(cacheKey, { expiresAt: Date.now() + ttl * 1000, status: 200, body: payload });
    return { status: 200, body: payload, cacheSeconds: ttl };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      status: aborted ? 504 : 502,
      body: {
        status: 'error',
        code: aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
        message: aborted ? 'Twelve Data did not respond in time' : 'Could not reach Twelve Data',
      },
      cacheSeconds: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
