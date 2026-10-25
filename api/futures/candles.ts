// ============================================
// GET /api/futures/candles
// ============================================
// Server-side only. Holds the vendor API key and returns real candles for a
// futures instrument. The browser never sees the key.
//
// Query: instrument, timeframe, limit
//
// The route resolves the instrument's symbol from the candidate list (futures
// first, then a proxy), caches the payload briefly so concurrent users share one
// vendor call, and reports WHICH symbol answered and whether it is a proxy. The
// client renders that provenance next to the instrument name; a proxy is never
// presented as the futures contract.
//
// Response:
//   { ok: true, candles, source, symbol, interval, symbolKind, symbolLabel,
//     isProxy, roll }
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
import { loadCandles, type ResolvedSymbol } from '../_lib/candleCache';
import type { Candle, Timeframe } from '../../src/core/types';
import { TIMEFRAMES } from '../../src/core/types';
import { fetchTimeSeries, TwelveDataError } from '../_lib/twelvedata';
import { candidatesFor, findCandidate, type SymbolCandidate } from '../_lib/symbols';

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

  const candidates = candidatesFor(instrumentId);
  if (candidates.length === 0) {
    sendJson(res, 200, errorBody('UNSUPPORTED_INSTRUMENT', `No symbol mapping for ${instrumentId}`));
    return;
  }

  // An explicit override pins a single symbol and skips the walk, so a
  // deployment can point at whatever its plan actually entitles.
  const override = symbolOverride(instrumentId);

  try {
    const { candles, resolved, cached } = override
      ? await loadPinnedSymbol(override, instrumentId, timeframe, limit, apiKey)
      : await loadCandles({
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
      tried: resolved.tried,
      cached,
      roll: { method: rollMethod(), adjustment: rollAdjustment() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Futures request failed';
    sendJson(res, 200, errorBody(errorKindFor(error), message));
  }
}

/** A pinned symbol override still goes through the same fetch path. */
async function loadPinnedSymbol(
  symbol: string,
  instrumentId: string,
  timeframe: string,
  limit: number,
  apiKey: string
): Promise<{ candles: Candle[]; cached: boolean; resolved: ResolvedSymbol }> {
  const result = await fetchTimeSeries({
    symbol,
    timeframe,
    limit: Math.min(Number.isFinite(limit) ? limit : 300, MAX_LIMIT),
    apiKey,
  });

  // An override may name a symbol that is not in the catalog. A continuous
  // contract (!-suffixed) is still a futures contract; anything else is
  // reported as a proxy rather than being called the futures contract.
  const candidate: SymbolCandidate =
    findCandidate(instrumentId, symbol) ??
    (symbol.endsWith('!')
      ? { symbol, kind: 'futures', description: `${symbol} (configured)`, continuous: true }
      : { symbol, kind: 'proxy', description: `${symbol} (configured)` });

  return {
    candles: result.candles,
    cached: false,
    resolved: {
      candidate,
      vendorSymbol: result.symbol,
      instrumentType: result.instrumentType,
      exchange: result.exchange,
      resolvedAt: Date.now(),
      tried: [],
    },
  };
}
