// ============================================
// GET /api/orderflow/reading
// ============================================
// Server-side only. Reports whether an order-book source is configured and, when
// it is, returns that source's real resting book for one instrument.
//
// Query: instrument, timeframe
//
// It costs no vendor credits when nothing is configured, which is the shipped
// state — the client calls it once on load to learn whether the "Order Book"
// card should draw a gauge or say "No order book source configured", then polls
// it on its own real-time cadence.
//
// The vendor-specific work lives in api/_lib/orderflow.ts. Nothing here invents a
// book: an unconfigured or silent source answers with `book: null`.
//
// Response:
//   { configured, provider, label, note, book }
//   book is null when there is nothing real to show.

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
        : 'Set ALPACA_API_KEY and ALPACA_API_SECRET to read the order book.',
      book: null,
    });
    return;
  }

  if (!configured) {
    sendJson(res, 200, {
      configured: false,
      provider: 'none',
      label: 'None',
      note: 'No order book source configured.',
      book: null,
    });
    return;
  }

  const timeframe = first(req.query.timeframe) ?? '15m';
  const apiKey = orderFlowApiKey();
  if (!apiKey) {
    sendJson(res, 200, { configured: false, provider: 'none', label: 'None', note: 'No order book source configured.', book: null });
    return;
  }

  try {
    const book = await fetchOrderFlowReading({ instrumentId, timeframe, apiKey });
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      // A null book is a real answer, not a failure: this instrument's provider
      // publishes no book (Gold reads Twelve Data), or the book had no two-sided
      // quote. The client shows that honestly rather than a neutral zero.
      note: book ? null : 'No resting book available for this instrument.',
      book,
    });
  } catch (error) {
    // A failed vendor call is reported as no book, never as a fabricated one.
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      note: error instanceof Error ? error.message : 'Order book request failed',
      book: null,
    });
  }
}
