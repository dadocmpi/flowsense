// ============================================
// ORDER FLOW ADAPTER (server-side)
// ============================================
// THE ONE FILE TO EDIT TO CONNECT A REAL ORDER-FLOW PROVIDER.
//
// The browser never holds a vendor key, so the right-hand "Order flow" compass
// reads order flow through this server module. The client already speaks the
// shape below (see src/core/providers/orderflow.ts); connecting a vendor means
// implementing `fetchOrderFlowReading` here and setting the two environment
// variables in the deployment:
//
//   ORDERFLOW_PROVIDER=your-provider     (anything other than "none")
//   ORDERFLOW_API_KEY=...                (read only here, never in the bundle)
//
// Twelve Data has NO order-flow data. A candle carries no aggressor side and no
// order book, so order flow can never be derived from the candle feed — this
// adapter deliberately returns null rather than inventing a delta.
//
// CONTRACT
//   return a reading  -> the card renders the gauge and the key numbers
//   return null       -> the card shows "No order flow source configured"
//
// `OrderFlowReading` is the exact shape the client expects:
//   { gauge: { score, label, tally, details }, metrics: { delta, cvd,
//     imbalance, absorption }, source: 'vendor name' }
// The score is on the same -100..+100 scale as the other two compasses, and the
// label must come from labelFromScore so it can never disagree with the score.

import type { GaugeReading } from '../../src/core/types.js';

export interface OrderFlowMetrics {
  delta: number | null;
  cvd: number | null;
  imbalance: number | null;
  absorption: number | null;
}

export interface OrderFlowReading {
  gauge: GaugeReading;
  metrics: OrderFlowMetrics;
  source: string;
}

export type OrderFlowVendor = 'none' | 'custom';

/** Which adapter this deployment is configured to use. */
export function resolveOrderFlowVendor(): OrderFlowVendor {
  const raw = (process.env.ORDERFLOW_PROVIDER ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'none') return 'none';
  return 'custom';
}

/** The vendor key. Read only on the server; never returned to the client. */
export function orderFlowApiKey(): string | null {
  const key = (process.env.ORDERFLOW_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/**
 * True when a source is configured AND has everything it needs.
 *
 * `custom` without a key is not configured: saying so is more useful than
 * failing later with a vendor error the user cannot act on.
 */
export function orderFlowConfigured(): boolean {
  return resolveOrderFlowVendor() === 'custom' && orderFlowApiKey() !== null;
}

/** A human label for the configured source, for the provenance line. */
export function orderFlowLabel(): string {
  if (!orderFlowConfigured()) return 'None';
  return (process.env.ORDERFLOW_PROVIDER ?? 'custom').trim();
}

/**
 * Fetch a real order-flow reading for one instrument and timeframe.
 *
 * ── EDIT HERE to connect a vendor ────────────────────────────────────────────
 * Replace the `return null` below with the vendor call and map the response onto
 * `OrderFlowReading`. Return null whenever the vendor has nothing to report; do
 * not synthesise a value. The key is in `orderFlowApiKey()`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function fetchOrderFlowReading(_params: {
  instrumentId: string;
  timeframe: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<OrderFlowReading | null> {
  // No order-flow vendor is wired up in this build. Returning null is the honest
  // answer: the card says "No order flow source configured" and draws no gauge.
  return null;
}
