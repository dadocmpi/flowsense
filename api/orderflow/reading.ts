// ============================================
// GET /api/orderflow/reading
// ============================================
// Server-side only. Reports whether an order-flow source is configured and, when
// it is, returns that source's real reading for one instrument and timeframe.
//
// Query: instrument, timeframe
//
// The shipped source is Alpaca (api/_lib/alpacaOrderFlow.ts): its market-data
// API carries a tape of every trade and the real top-of-book quote for the index
// assets (S&P 500, Dow, Nasdaq) and Gold. It authenticates with the same
// server-side credentials the candle feed uses.
// The probe below costs no vendor call; only a request that names an instrument
// reads the venue.
//
// Nothing here invents a reading: an instrument with no market on the venue, or a
// venue that cannot be reached, answers with `reading: null` and a note. The
// client shows that as an unavailable state, never as a neutral reading.
//
// Response:
//   { configured, provider, label, venue, note, reading }
//   reading is null when there is nothing real to show.

import { sendJson, first, type ApiRequest, type ApiResponse } from '../_lib/futuresShared.js';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowHasMarket,
  orderFlowLabel,
  resolveOrderFlowVendor,
} from '../_lib/orderflow.js';
import { AlpacaError } from '../_lib/alpaca.js';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { kind: 'UNKNOWN', message: 'Only GET is supported' } });
    return;
  }

  const venue = resolveOrderFlowVendor();
  const configured = orderFlowConfigured();

  // A probe with no instrument is the client asking "is there a source?". Answer
  // that without a vendor call.
  const instrumentId = first(req.query.instrument);
  if (!instrumentId) {
    sendJson(res, 200, {
      configured,
      provider: configured ? 'http' : 'none',
      label: orderFlowLabel(),
      venue,
      note: configured
        ? `Configured: ${orderFlowLabel()}`
        : 'Set ALPACA_API_KEY/ALPACA_API_SECRET to enable order flow.',
      reading: null,
    });
    return;
  }

  if (!configured) {
    sendJson(res, 200, {
      configured: false,
      provider: 'none',
      label: 'None',
      venue,
      note: 'No order flow source configured.',
      reading: null,
    });
    return;
  }

  const timeframe = first(req.query.timeframe) ?? '15m';

  // An instrument the venue has no market for is not an error: the card says so
  // rather than reading a different symbol.
  if (!orderFlowHasMarket(instrumentId)) {
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      venue,
      note: `No ${orderFlowLabel()} market for ${instrumentId}.`,
      reading: null,
    });
    return;
  }

  try {
    const reading = await fetchOrderFlowReading({
      instrumentId,
      timeframe,
      apiKey: orderFlowApiKey(),
    });
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      venue,
      note: reading ? null : `The ${orderFlowLabel()} source returned no reading.`,
      reading,
    });
  } catch (error) {
    // A failed venue call is reported as no reading, never as a fabricated one.
    const note =
      error instanceof AlpacaError || error instanceof Error ? error.message : 'Order flow request failed';
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label: orderFlowLabel(),
      venue,
      note,
      reading: null,
    });
  }
}
