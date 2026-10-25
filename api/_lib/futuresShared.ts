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
  // An unset provider is not an error; it means "not configured yet".
  return null;
}

export function vendorApiKey(): string | null {
  const key = (process.env.FUTURES_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/**
 * Optional per-instrument symbol override, so a deployment can point at
 * whichever continuous contract its vendor expects without a code change.
 * Example: FUTURES_SYMBOL_GC=GC1!
 */
export function symbolOverride(instrumentId: string): string | null {
  const value = (process.env[`FUTURES_SYMBOL_${instrumentId.toUpperCase()}`] ?? '').trim();
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
