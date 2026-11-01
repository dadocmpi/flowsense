// ============================================
// GET /api/orderflow/reading
// ============================================
// Server-side only. Reports whether an order-flow source is configured and, when
// it is, returns that source's real reading for one instrument and timeframe.
//
// Query: instrument, timeframe
//
// It costs no vendor credits when nothing is configured, which is the shipped
// state — the client calls it once on load to learn whether the "Order flow"
// card should draw a gauge or say "No order flow source configured".
//
// The vendor-specific work lives in api/_lib/orderflow.ts, the single file to
// edit to connect a provider. Nothing here invents a reading: an unconfigured or
// silent source answers with `reading: null`.
//
// Response:
//   { configured, provider, label, note, reading }
//   reading is null when there is nothing real to show.

import { sendJson, first, type ApiRequest, type ApiResponse } from '../_lib/futuresShared.js';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowLabel,
  resolveOrderFlowVendor,
} from '../_lib/orderflow.js';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { kind: 'UNKNOWN', message: 'Only GET is supported' } });
    return;
  }

  const vendor = resolveOrderFlowVendor();
  const configured = orderFlowConfigured();

  // A probe with no instrument is the client asking "is there a source?". Answer
  // that without a vendor call.
  const instrumentId = first(req.query.instrument);
  if (!instrumentId) {
    sendJson(res, 200, {
      configured,
      provider: configured ? 'http' : 'none',
      label: orderFlowLabel(),
      note: configured
        ? `Configured: ${vendor}`
        : 'Set ORDERFLOW_PROVIDER and ORDERFLOW_API_KEY to enable order flow.',
      reading: null,
    });
    return;
  }

  if (!configured) {
    sendJson(res, 200, {
      configured: false,
      provider: 'none',
      label: 'None',
      note: 'No order flow source configured.',
      reading: null,
    });
    return;
  }

  const timeframe = first(req.query.timeframe) ?? '15m';
  const apiKey = orderFlowApiKey();
  if (!apiKey) {
    sendJson(res, 200, { configured: false, provider: 'none', label: 'None', note: 'No order flow source configured.', reading: null });
    return;
  }

  try {
    const reading = await fetchOrderFlowReading({ instrumentId, timeframe, apiKey });
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      note: reading ? null : 'The order flow source returned no reading.',
      reading,
    });
  } catch (error) {
    // A failed vendor call is reported as no reading, never as a fabricated one.
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      note: error instanceof Error ? error.message : 'Order flow request failed',
      reading: null,
    });
  }
}
