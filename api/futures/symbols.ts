// ============================================
// GET /api/futures/symbols
// ============================================
// Discovery: for each instrument, walk its candidate symbols and report which
// one actually returns data on this plan. This is what `npm run check:symbols`
// calls, and it is also safe to open in a browser while debugging.
//
// It costs one credit per candidate per run, so it is a diagnostic, not
// something the app calls on its own.
//
// Query: ?search=gold   also runs a symbol_search for the phrase and lists what
//                       the vendor offers, which is how you find a replacement
//                       when every candidate fails.
//
// Never returns the key. Never invents a result: a candidate that fails is
// reported as failed, with the vendor's own message.

import { first, resolveVendor, sendJson, vendorApiKey, type ApiRequest, type ApiResponse } from '../_lib/futuresShared';
import { fetchTimeSeries, searchSymbols, TwelveDataError } from '../_lib/twelvedata';
import { INSTRUMENT_SYMBOLS } from '../_lib/symbols';

/** One small bar is enough to prove entitlement, and costs the least. */
const PROBE_TIMEFRAME = '1D';
const PROBE_LIMIT = 2;

interface CandidateReport {
  symbol: string;
  kind: 'futures' | 'proxy';
  description: string;
  ok: boolean;
  candles?: number;
  newest?: string;
  instrumentType?: string;
  exchange?: string;
  error?: string;
}

async function probeSymbol(
  symbol: string,
  kind: 'futures' | 'proxy',
  description: string,
  apiKey: string
): Promise<CandidateReport> {
  try {
    const result = await fetchTimeSeries({ symbol, timeframe: PROBE_TIMEFRAME, limit: PROBE_LIMIT, apiKey });
    if (result.candles.length === 0) {
      return { symbol, kind, description, ok: false, error: 'No candles returned' };
    }
    return {
      symbol,
      kind,
      description,
      ok: true,
      candles: result.candles.length,
      newest: result.candles[result.candles.length - 1].datetime,
      instrumentType: result.instrumentType,
      exchange: result.exchange,
    };
  } catch (error) {
    if (error instanceof TwelveDataError && (error.kind === 'RATE_LIMIT' || error.kind === 'NETWORK')) {
      // A rate limit is not the symbol's fault; report it and stop the walk.
      throw error;
    }
    return {
      symbol,
      kind,
      description,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const vendor = resolveVendor();
  const apiKey = vendorApiKey();

  if (!vendor || !apiKey) {
    sendJson(res, 200, {
      ok: false,
      configured: false,
      error: {
        kind: 'NOT_CONFIGURED',
        message: 'Set TWELVE_DATA_API_KEY before running symbol discovery',
      },
    });
    return;
  }

  const search = first(req.query.search);

  try {
    const instruments = [];
    for (const entry of INSTRUMENT_SYMBOLS) {
      const candidates: CandidateReport[] = [];
      for (const candidate of entry.candidates) {
        candidates.push(await probeSymbol(candidate.symbol, candidate.kind, candidate.description, apiKey));
      }
      const firstWorking = candidates.find(c => c.ok) ?? null;
      instruments.push({
        instrumentId: entry.instrumentId,
        candidates,
        // What the app will actually use, and whether it is a proxy.
        chosen: firstWorking,
        chosenIsProxy: firstWorking ? firstWorking.kind === 'proxy' : null,
      });
    }

    let searchResults: Array<Record<string, unknown>> | undefined;
    if (search) {
      const matches = await searchSymbols(search, apiKey);
      searchResults = matches.slice(0, 25).map(match => ({
        symbol: match.symbol,
        name: match.instrument_name,
        exchange: match.exchange,
        type: match.instrument_type,
        currency: match.currency,
      }));
    }

    sendJson(res, 200, { ok: true, configured: true, probeTimeframe: PROBE_TIMEFRAME, instruments, searchResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Symbol discovery failed';
    const kind = error instanceof TwelveDataError && error.kind === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'UPSTREAM';
    sendJson(res, 200, { ok: false, configured: true, error: { kind, message } });
  }
}
