// ============================================
// GET /api/orderflow/binance-config
// ============================================
// Server-side only, and costs nothing: it reports how the Binance USDT-M flow
// feed is configured and whether the venue's REST endpoint is reachable from
// THIS region.
//
// The reachability probe exists because a browser WebSocket reports no HTTP
// status: a socket that closes at once is either a network fault or the venue
// refusing this region, and only a REST call can tell them apart. Binance
// answers HTTP 451 to a restricted location, which is exactly the fact the UI
// needs to show instead of a bare "down".
//
// No API key is involved: these are public market-data endpoints.
//
// Response:
//   { ok, enabled, symbol, venue, wsHost, restReachable, restStatus, restNote }

import { sendJson, type ApiRequest, type ApiResponse } from '../_lib/futuresShared.js';

const DEFAULT_SYMBOL = 'XAUUSDT';
const DEFAULT_WS_HOST = 'wss://fstream.binance.com';
const DEFAULT_REST_HOST = 'https://fapi.binance.com';
const PROBE_TIMEOUT_MS = 4_000;

function env(name: string, fallback: string): string {
  const value = (process.env[name] ?? '').trim();
  return value.length > 0 ? value : fallback;
}

function flowEnabled(): boolean {
  const raw = (process.env.ORDERFLOW_BINANCE_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

interface Probe {
  reachable: boolean;
  status: number | null;
  note: string | null;
}

/** Ask the venue's public REST endpoint whether this region is served. */
async function probeRest(restHost: string): Promise<Probe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${restHost}/fapi/v1/ping`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (response.status === 451) {
      return { reachable: false, status: 451, note: 'Venue geo-blocked this region (HTTP 451)' };
    }
    if (!response.ok) {
      return { reachable: false, status: response.status, note: `Venue REST probe returned HTTP ${response.status}` };
    }
    return { reachable: true, status: response.status, note: null };
  } catch {
    return { reachable: false, status: null, note: 'Venue REST probe unreachable from the server' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { kind: 'UNKNOWN', message: 'Only GET is supported' } });
    return;
  }

  const symbol = env('ORDERFLOW_BINANCE_SYMBOL', DEFAULT_SYMBOL);
  const wsHost = env('ORDERFLOW_BINANCE_WS_HOST', DEFAULT_WS_HOST);
  const restHost = env('ORDERFLOW_BINANCE_REST_HOST', DEFAULT_REST_HOST);
  const enabled = flowEnabled();

  // Probe regardless of `enabled`: the fact is useful to report either way.
  const probe = await probeRest(restHost);

  sendJson(res, 200, {
    ok: true,
    enabled,
    symbol,
    venue: `Binance USDT-M ${symbol} PERP`,
    wsHost,
    restReachable: probe.reachable,
    restStatus: probe.status,
    restNote: probe.note,
  });
}
