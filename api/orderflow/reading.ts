// ============================================
// GET /api/orderflow/reading
// ============================================
// Server-side only. Reports whether an order-flow source is configured and, when
// it is, returns that source's real reading for one instrument.
//
// Query: instrument, window (1m|5m|15m), timeframe (kept for compatibility)
//
// The venue is chosen PER ASSET (api/_lib/orderflow.ts): Gold reads Binance
// PAXG/USDT, the index assets read Alpaca SPY/DIA/QQQ — the same venue that
// serves their candles — because Binance has no market for the indices. The
// probe below (no instrument) costs no vendor call; only a request that names an
// instrument reads a venue.
//
// Nothing here invents a reading: an instrument with no market on its venue, or
// a venue that cannot be reached, answers with `reading: null` and a note. The
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
  orderFlowConfiguredFor,
  orderFlowHasMarket,
  orderFlowLabel,
  orderFlowVenueFor,
  ORDERFLOW_ASSET_IDS,
} from '../_lib/orderflow.js';
import { BinanceError } from '../_lib/binance.js';
import { AlpacaError } from '../_lib/alpaca.js';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { kind: 'UNKNOWN', message: 'Only GET is supported' } });
    return;
  }

  // A probe with no instrument is the client asking "is there a source?". Answer
  // that without a vendor call. The per-asset venue map lets the client pick the
  // right capabilities (Binance has a depth book; Alpaca has a quote) before it
  // has read any instrument.
  const instrumentId = first(req.query.instrument);
  if (!instrumentId) {
    const configured = orderFlowConfigured();
    sendJson(res, 200, {
      configured,
      provider: configured ? 'http' : 'none',
      label: orderFlowLabel(),
      venue: 'multi',
      venues: Object.fromEntries(ORDERFLOW_ASSET_IDS.map(id => [id, orderFlowVenueFor(id)])),
      note: configured
        ? `Configured: ${orderFlowLabel()}`
        : 'Set ORDERFLOW_PROVIDER to enable order flow.',
      reading: null,
    });
    return;
  }

  const venue = orderFlowVenueFor(instrumentId);
  const label = orderFlowLabel(instrumentId);
  const configured = orderFlowConfiguredFor(instrumentId);

  if (!configured) {
    sendJson(res, 200, {
      configured: false,
      provider: 'none',
      label: 'None',
      venue,
      note: `No ${label} credentials configured for ${instrumentId}.`,
      reading: null,
    });
    return;
  }

  const timeframe = first(req.query.timeframe) ?? '15m';
  const window = first(req.query.window);

  // An instrument the venue has no market for is not an error: the card says so
  // rather than reading a different symbol.
  if (!orderFlowHasMarket(instrumentId)) {
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label,
      venue,
      note: `No ${label} market for ${instrumentId}.`,
      reading: null,
    });
    return;
  }

  try {
    const reading = await fetchOrderFlowReading({
      instrumentId,
      timeframe,
      window,
      apiKey: orderFlowApiKey(),
    });
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label,
      venue,
      note: reading ? null : `The ${label} source returned no reading.`,
      reading,
    });
  } catch (error) {
    // A failed venue call is reported as no reading, never as a fabricated one.
    const note =
      error instanceof BinanceError || error instanceof AlpacaError || error instanceof Error
        ? error.message
        : 'Order flow request failed';
    sendJson(res, 200, {
      configured: true,
      provider: 'http',
      label,
      venue,
      note,
      reading: null,
    });
  }
}
