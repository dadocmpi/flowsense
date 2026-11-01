// ============================================
// GET /api/futures/candles
// ============================================
// Server-side only. Holds the vendor API key and returns real candles for a
// futures instrument. The browser never sees the key.
//
// Query: instrument, timeframe, limit
//
// The route asks for the instrument's ONE configured symbol (api/_lib/symbols.ts)
// and caches the payload briefly so concurrent users share one vendor call. It
// reports WHICH symbol answered and whether it is a proxy. The client renders
// that provenance next to the instrument name; a proxy is never presented as the
// futures contract.
//
// There is no symbol fallback here. A symbol that fails returns an error for that
// asset rather than spending more credits trying another — see the symbol
// mapping's header comment for why.
//
// Every vendor call goes through the credit meter, which is why this route never
// reaches Twelve Data once the minute is spent: it answers with RATE_LIMIT and a
// `retryAfterMs`, and the client shows "Rate limit — retrying in Xs" with the
// last cached data marked stale.
//
// Response:
//   { ok: true, candles, source, symbol, interval, symbolKind, symbolLabel,
//     isProxy, roll, cached }
//   { ok: false, error: { kind, message, retryAfterMs? } }
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
  vendorApiKey,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/futuresShared.js';
import { loadCandles } from '../_lib/candleCache.js';
import type { Timeframe } from '../../src/core/types.js';
import { TIMEFRAMES } from '../../src/core/types.js';
import { TwelveDataError } from '../_lib/twelvedata.js';
import { CreditLimitError, meterSnapshot } from '../_lib/creditMeter.js';
import { configuredSymbol } from '../_lib/symbols.js';

const MAX_LIMIT = 1000;

/** Reject an unknown timeframe rather than silently substituting one. */
function asTimeframe(value: string): Timeframe | null {
  return (TIMEFRAMES as string[]).includes(value) ? (value as Timeframe) : null;
}

/** Map a vendor error kind onto the ProviderErrorKind the client renders. */
function errorKindFor(error: unknown): string {
  if (error instanceof TwelveDataError) {
    switch (error.kind) {
      case 'RATE_LIMIT':
        return 'RATE_LIMIT';
      case 'NETWORK':
        return 'NETWORK';
      case 'ENTITLEMENT':
        return 'SYMBOL_NOT_FOUND';
      default:
        return 'UPSTREAM';
    }
  }
  return 'UPSTREAM';
}

/** Epoch ms a blocked caller may retry, from the error or the meter itself. */
function retryAfterMsFor(error: unknown): number | undefined {
  if (error instanceof TwelveDataError && error.kind === 'RATE_LIMIT') {
    const fromError = error.retryAfterMs;
    const fromMeter = Math.max(0, meterSnapshot().resetAt - Date.now());
    return Math.max(0, fromError ?? fromMeter);
  }
  if (error instanceof CreditLimitError) return Math.max(0, error.resetAt - Date.now());
  return undefined;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, errorBody('UNKNOWN', 'Only GET is supported'));
    return;
  }

  // `instrument` is the app's stable id (GC/ES/YM); `symbol` is accepted for
  // backwards compatibility with an older client.
  const instrumentId = first(req.query.instrument) ?? first(req.query.symbol);
  const rawTimeframe = first(req.query.timeframe) ?? '5m';
  const limit = Number.parseInt(first(req.query.limit) ?? '300', 10);

  if (!instrumentId) {
    sendJson(res, 400, errorBody('UNKNOWN', 'An instrument is required'));
    return;
  }

  const timeframe = asTimeframe(rawTimeframe);
  if (!timeframe) {
    sendJson(res, 400, errorBody('UNKNOWN', `Unsupported timeframe: ${rawTimeframe}`));
    return;
  }

  const vendor = resolveVendor();
  const apiKey = vendorApiKey();

  if (!vendor || !apiKey) {
    sendJson(res, 200, errorBody('NOT_CONFIGURED', 'No futures data source is configured on the server'));
    return;
  }

  const candidate = configuredSymbol(instrumentId);
  if (!candidate) {
    sendJson(res, 200, errorBody('UNSUPPORTED_INSTRUMENT', `No symbol mapping for ${instrumentId}`));
    return;
  }

  try {
    const { candles, resolved, cached } = await loadCandles({
      instrumentId,
      timeframe,
      limit: Math.min(Number.isFinite(limit) ? limit : 300, MAX_LIMIT),
      apiKey,
    });

    if (candles.length === 0) {
      sendJson(res, 200, errorBody('SYMBOL_NOT_FOUND', `No candles returned for ${resolved.candidate.symbol}`));
      return;
    }

    const isProxy = resolved.candidate.kind === 'proxy';
    sendJson(res, 200, {
      ok: true,
      candles,
      source: `${vendor} (${resolved.vendorSymbol}, ${timeframe})`,
      symbol: resolved.vendorSymbol,
      interval: timeframe,
      // Provenance: what was really requested, and whether it is a proxy.
      symbolKind: resolved.candidate.kind,
      symbolLabel: resolved.candidate.description,
      isProxy,
      requestedSymbol: resolved.candidate.symbol,
      instrumentType: resolved.instrumentType,
      exchange: resolved.exchange,
      cached,
      roll: { method: rollMethod(), adjustment: rollAdjustment() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Futures request failed';
    const retryAfterMs = retryAfterMsFor(error);
    sendJson(res, 200, {
      ok: false,
      error: {
        kind: errorKindFor(error),
        // Never the raw vendor text: the client shows our own rate-limit state.
        message: errorKindFor(error) === 'RATE_LIMIT' ? 'Rate limit reached' : message,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      },
    });
  }
}
