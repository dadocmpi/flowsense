// ============================================
// GET /api/futures/candles
// ============================================
// Server-side only. Holds the vendor API key and returns real candles for a
// futures instrument. The browser never sees the key.
//
// Query: symbol, continuous, timeframe, limit
//
// Response:
//   { ok: true, candles: Candle[], source, symbol, interval }
//   { ok: false, error: { kind, message } }
//
// `kind` is one of the ProviderErrorKind values the client understands, and
// NOT_CONFIGURED is distinct from every real failure so the UI can say
// "no data source configured" rather than showing an error.

import {
  errorBody,
  first,
  resolveVendor,
  rollAdjustment,
  rollMethod,
  sendJson,
  symbolOverride,
  vendorApiKey,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/futuresShared';
import { fetchTimeSeries } from '../_lib/twelvedata';

const MAX_LIMIT = 1000;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, errorBody('UNKNOWN', 'Only GET is supported'));
    return;
  }

  const symbol = first(req.query.symbol);
  const continuous = first(req.query.continuous);
  const timeframe = first(req.query.timeframe) ?? '5m';
  const limit = Number.parseInt(first(req.query.limit) ?? '300', 10);

  if (!symbol) {
    sendJson(res, 400, errorBody('UNKNOWN', 'A symbol is required'));
    return;
  }

  const vendor = resolveVendor();
  const apiKey = vendorApiKey();

  if (!vendor || !apiKey) {
    sendJson(res, 200, errorBody('NOT_CONFIGURED', 'No futures data source is configured on the server'));
    return;
  }

  // Prefer an explicit per-instrument override, then the continuous contract,
  // then the bare root symbol.
  const requestSymbol = symbolOverride(symbol) ?? continuous ?? symbol;

  try {
    const result = await fetchTimeSeries({
      symbol: requestSymbol,
      timeframe,
      limit: Math.min(Number.isFinite(limit) ? limit : 300, MAX_LIMIT),
      apiKey,
    });

    if (result.candles.length === 0) {
      sendJson(res, 200, errorBody('SYMBOL_NOT_FOUND', `No candles returned for ${requestSymbol}`));
      return;
    }

    sendJson(res, 200, {
      ok: true,
      candles: result.candles,
      source: `${vendor} (${result.symbol}, ${result.interval})`,
      symbol: result.symbol,
      interval: result.interval,
      roll: { method: rollMethod(), adjustment: rollAdjustment() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Futures request failed';
    // Map the vendor's own wording onto the error kinds the client renders.
    const lower = message.toLowerCase();
    const kind = lower.includes('api key') || lower.includes('apikey')
      ? 'NOT_CONFIGURED'
      : lower.includes('rate limit') || lower.includes('credits')
        ? 'RATE_LIMIT'
        : lower.includes('not found') || lower.includes('invalid symbol')
          ? 'SYMBOL_NOT_FOUND'
          : 'UPSTREAM';
    sendJson(res, 200, errorBody(kind, message));
  }
}
