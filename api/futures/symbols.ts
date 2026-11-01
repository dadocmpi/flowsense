// ============================================
// GET /api/futures/symbols
// ============================================
// Discovery: probe candidate symbols and report which one returns data on this
// plan. This is what `npm run check:symbols` calls, and it is also safe to open
// in a browser while debugging.
//
// It is a DIAGNOSTIC, not something the app calls on its own. The app never
// probes at runtime — see api/_lib/symbols.ts for why. Every probe here goes
// through the credit meter, so a diagnostic run stops at the minute limit instead
// of pushing the account further over it.
//
// Query: ?search=gold   also runs a symbol_search for the phrase and lists what
//                       the vendor offers, which is how you find a replacement
//                       when the default symbol fails.
//
// Never returns the key. Never invents a result: a candidate that fails is
// reported as failed, with the vendor's own message.

import { first, resolveVendor, sendJson, vendorApiKey, type ApiRequest, type ApiResponse } from '../_lib/futuresShared.js';
import { fetchTimeSeries, searchSymbols, TwelveDataError } from '../_lib/twelvedata.js';
import { meterSnapshot } from '../_lib/creditMeter.js';
import { DISCOVERY_CANDIDATES, INSTRUMENT_SYMBOLS } from '../_lib/symbols.js';

/** One small bar is enough to prove entitlement, and costs the least. */
const PROBE_TIMEFRAME = '1D';
const PROBE_LIMIT = 2;

interface CandidateReport {
  symbol: string;
  kind: 'futures' | 'proxy';
  ok: boolean;
  candles?: number;
  newest?: string;
  instrumentType?: string;
  exchange?: string;
  error?: string;
}

async function probeSymbol(symbol: string, kind: 'futures' | 'proxy', apiKey: string): Promise<CandidateReport> {
  try {
    const result = await fetchTimeSeries({ symbol, timeframe: PROBE_TIMEFRAME, limit: PROBE_LIMIT, apiKey });
    if (result.candles.length === 0) {
      return { symbol, kind, ok: false, error: 'No candles returned' };
    }
    return {
      symbol,
      kind,
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
    const byInstrument = new Map<string, CandidateReport[]>();
    for (const probe of DISCOVERY_CANDIDATES) {
      const report = await probeSymbol(probe.symbol, probe.kind, apiKey);
      const list = byInstrument.get(probe.instrumentId) ?? [];
      list.push(report);
      byInstrument.set(probe.instrumentId, list);
    }

    const instruments = [...byInstrument.entries()].map(([instrumentId, candidates]) => {
      const firstWorking = candidates.find(c => c.ok) ?? null;
      const entry = INSTRUMENT_SYMBOLS.find(e => e.instrumentId === instrumentId);
      return {
        instrumentId,
        configured: entry?.symbol.symbol ?? null,
        candidates,
        // What the app will actually use, and whether it is a proxy.
        chosen: firstWorking,
        chosenIsProxy: firstWorking ? firstWorking.kind === 'proxy' : null,
      };
    });

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

    sendJson(res, 200, {
      ok: true,
      configured: true,
      probeTimeframe: PROBE_TIMEFRAME,
      credits: meterSnapshot(),
      instruments,
      searchResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Symbol discovery failed';
    const kind = error instanceof TwelveDataError && error.kind === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'UPSTREAM';
    sendJson(res, 200, { ok: false, configured: true, error: { kind, message } });
  }
}
