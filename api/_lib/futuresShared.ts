// ============================================
// SHARED FUTURES ROUTE HELPERS
// ============================================
// Both futures routes run on the server, so the API key lives here and never
// reaches the browser bundle. Nothing in this file is imported by src/.

export interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Candle responses are per-instrument and change constantly; never cache them
  // at the edge, or a stale bar could be presented as current.
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
}

export function errorBody(kind: string, message: string) {
  return { ok: false, error: { kind, message } };
}

/**
 * The vendor this deployment is configured to use. Only one implementation
 * ships today; the switch exists so adding another is a local change.
 */
export type FuturesVendor = 'twelvedata';

export function resolveVendor(): FuturesVendor | null {
  const raw = (process.env.FUTURES_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'twelvedata') return 'twelvedata';
  // Setting the provider's own key is enough to mean "use Twelve Data", so a
  // deployment does not have to set both variables to get started.
  if (raw === '' && (process.env.TWELVE_DATA_API_KEY ?? '').trim().length > 0) return 'twelvedata';
  // An unset provider is not an error; it means "not configured yet".
  return null;
}

export function vendorApiKey(): string | null {
  // TWELVE_DATA_API_KEY is the name the provider's own docs use; FUTURES_API_KEY
  // is kept as a fallback so an existing deployment does not break.
  const key = (process.env.TWELVE_DATA_API_KEY ?? process.env.FUTURES_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/**
 * Whether the vendor's WebSocket is usable on this plan.
 *
 * Defaults to enabled: if the plan has no WebSocket entitlement the connection
 * simply fails and the client falls back to polling, which is a graceful
 * outcome. Setting TWELVE_DATA_WS=false skips the attempt entirely.
 */
export function websocketEnabled(): boolean {
  const raw = (process.env.TWELVE_DATA_WS ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

/** Optional per-instrument symbol override, pinning the first candidate. */
export function symbolOverride(instrumentId: string): string | null {
  const value = (process.env[`TWELVE_DATA_SYMBOL_${instrumentId.toUpperCase()}`] ?? '').trim();
  return value.length > 0 ? value : null;
}

/**
 * Contract roll handling.
 *
 * We request the vendor's CONTINUOUS front-month series rather than a dated
 * contract. Rolling a series correctly needs the exchange calendar, holiday
 * schedule and open-interest data, none of which can be reconstructed from
 * candles; a vendor that already publishes a continuous contract has done
 * that work properly.
 *
 * FUTURES_ROLL_METHOD then tells the UI how to describe the series:
 *   frontMonth    raw front-month, with a price gap at each roll
 *   backAdjusted  vendor-adjusted continuous series
 */
export function rollMethod(): 'frontMonth' | 'backAdjusted' {
  const raw = (process.env.FUTURES_ROLL_METHOD ?? 'frontMonth').trim().toLowerCase();
  return raw === 'backadjusted' || raw === 'back_adjusted' ? 'backAdjusted' : 'frontMonth';
}

export function rollAdjustment(): 'none' | 'ratio' | 'difference' {
  const raw = (process.env.FUTURES_ROLL_ADJUSTMENT ?? 'none').trim().toLowerCase();
  if (raw === 'ratio') return 'ratio';
  if (raw === 'difference') return 'difference';
  return 'none';
}
