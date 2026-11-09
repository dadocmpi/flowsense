// ============================================
// GET /api/orderflow/reading
// ============================================
// Server-side only. Reports whether an order-flow source is configured and, when
// it is, returns that source's real reading for one instrument and timeframe.
//
// Query: instrument, timeframe
//
// The venue is chosen PER ASSET (api/_lib/orderflow.ts): Gold reads Binance
// (PAXG/USDT, no key), the index assets read Alpaca (their tape + IEX top of
// same configured credentials as their candles). The probe below costs no vendor
// call; only a request that names an instrument reads a venue.
//
// Nothing here invents a reading: an instrument with no market on its venue, or
// a venue that cannot be reached, answers with `reading: null` and a note. The
// client shows that as an unavailable state, never as a neutral reading.
//
// Response:
//   { configured, provider, label, venue, note, reading }
//   `venue`/`label` describe the venue THIS instrument reads, so the client can
//   pick the right capabilities (a real depth book or the IEX top of book).

import { alpacaKeyId, alpacaSecretKey, sendJson, first, type ApiRequest, type ApiResponse } from '../_lib/futuresShared.js';
import {
  fetchOrderFlowReading,
  orderFlowApiKey,
  orderFlowConfigured,
  orderFlowConfiguredFor,
  orderFlowHasMarket,
  orderFlowLabel,
  orderFlowLabelFor,
  orderFlowVenueFor,
  resolveOrderFlowVendor,
} from '../_lib/orderflow.js';
import { BinanceError } from '../_lib/binance.js';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { kind: 'UNKNOWN', message: 'Only GET is supported' } });
    return;
  }

  const anyConfigured = orderFlowConfigured();

  // A probe with no instrument is the client asking "is there a source?". Answer
  // that without a vendor call, describing the deployment-wide venue.
  const instrumentId = first(req.query.instrument);
  if (!instrumentId) {
    sendJson(res, 200, {
      configured: anyConfigured,
      provider: anyConfigured ? 'http' : 'none',
      label: orderFlowLabel(),
      venue: resolveOrderFlowVendor(),
      note: anyConfigured
        ? `Configured: ${orderFlowLabel()}`
        : 'Order flow is switched off (ORDERFLOW_PROVIDER=none).',
      reading: null,
    });
    return;
  }

  const venue = orderFlowVenueFor(instrumentId);
  const label = orderFlowLabelFor(instrumentId);
  const configured = orderFlowConfiguredFor(instrumentId);

  if (!configured) {
    sendJson(res, 200, {
      configured: false,
      provider: 'none',
      label,
      venue,
      note: 'No order flow source configured for this asset.',
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
      apiKey: orderFlowApiKey(),
      keyId: alpacaKeyId(),
      secretKey: alpacaSecretKey(),
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
      error instanceof BinanceError || error instanceof Error ? error.message : 'Order flow request failed';
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
