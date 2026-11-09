// ============================================
// GET /api/orderflow/reading
// ============================================
// Server-side only. Reports whether an order-flow source is configured and, when
// it is, returns that source's real reading for one instrument and timeframe.
//
// Query: instrument, timeframe
//
// The venue is chosen PER ASSET (api/_lib/orderflow.ts): every shipped asset
// reads Alpaca — the index assets through their index ETF (SPY/DIA/QQQ) and Gold
// through the GLD ETF proxy — using the same configured credentials as their
// candles. The probe below costs no vendor call; only a request that names an
// instrument reads a venue.
//
// Nothing here invents a reading: an instrument with no market on its venue, or
// a venue that cannot be reached, answers with `reading: null` and a note. The
// client shows that as an unavailable state, never as a neutral reading.
//
// Response:
//   { configured, provider, label, venue, note, reading }
//   `venue`/`label` describe the venue THIS instrument reads, so the client can
//   pick the right capabilities (Alpaca publishes a one-level top of book).

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
import { AlpacaError, type AlpacaErrorKind } from '../_lib/alpaca.js';

// Our own wording for an upstream failure, keyed by the kind. The vendor's raw
// text is never shown in the UI: it can echo a request or an internal detail.
const VENUE_ERROR_NOTES: Record<AlpacaErrorKind, string> = {
  AUTH: 'The Alpaca credentials for order flow are not accepted.',
  RATE_LIMIT: 'Alpaca rate limit reached.',
  SYMBOL_NOT_FOUND: 'Alpaca has no market for this instrument.',
  SUBSCRIPTION: 'This Alpaca feed does not carry order flow for this instrument.',
  NETWORK: 'Could not reach Alpaca.',
  UPSTREAM: 'Alpaca could not serve the order flow request.',
};

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
    // The note is OUR wording for the failure kind, never the vendor's raw text.
    const note = error instanceof AlpacaError ? VENUE_ERROR_NOTES[error.kind] : 'Order flow request failed';
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
