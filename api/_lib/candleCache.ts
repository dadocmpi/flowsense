// ============================================
// SERVER-SIDE CANDLE CACHE
// ============================================
// One job, aimed at spending as few Twelve Data credits as possible: a candle
// payload for (symbol, timeframe) is reused for a short TTL, so ten users
// watching ES on M15 share one vendor call instead of ten.
//
// There is no symbol resolution here any more. The app used to walk an ordered
// candidate list (futures first, then a proxy) and remember the first that
// worked, which cost a credit per candidate and could burn three credits per
// timeframe on a plan that did not entitle the futures contract. The symbol is
// now a configured fact (api/_lib/symbols.ts); a failing symbol returns an error
// rather than spending more credits on a retry.
//
// The cache key deliberately EXCLUDES the requested bar count. A caller asking
// for two bars (the price poll) is served a slice of the payload a caller asking
// for a thousand already paid for, so the poll never costs a second credit.
//
// This module lives in memory, per serverless instance. That is a deliberate
// simplification: it needs no external store, and the worst case when an
// instance is cold is one extra vendor call, not a wrong number. Nothing here
// ever fabricates a candle — a failed lookup returns an error, never a series.

import { fetchTimeSeries, TwelveDataError, type TimeSeriesResult } from './twelvedata.js';
import { configuredSymbol, type SymbolCandidate } from './symbols.js';
import { cacheTtlFor } from '../../src/core/providers/polling.js';
import type { Timeframe } from '../../src/core/types.js';

export interface ResolvedSymbol {
  candidate: SymbolCandidate;
  /** The symbol string the vendor actually echoed back. */
  vendorSymbol: string;
  /** Vendor-reported instrument type, when present. */
  instrumentType?: string;
  exchange?: string;
  resolvedAt: number;
}

const candleCache = new Map<string, { result: TimeSeriesResult; expiresAt: number }>();

/** Test seam: forget everything cached. */
export function clearServerCaches(): void {
  candleCache.clear();
}

/** Keyed by symbol and timeframe only — the bar count is a slice of the payload. */
function cacheKey(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

export interface LoadCandlesOptions {
  instrumentId: string;
  timeframe: Timeframe;
  limit: number;
  apiKey: string;
}

export interface LoadCandlesResult {
  candles: TimeSeriesResult['candles'];
  resolved: ResolvedSymbol;
  /** True when the payload came from the in-memory cache. */
  cached: boolean;
}

/**
 * Candles for an instrument's configured symbol.
 *
 * One vendor call per (symbol, timeframe) per cache TTL, and never more than one
 * symbol per request: the configured symbol is the only one tried.
 */
export async function loadCandles({
  instrumentId,
  timeframe,
  limit,
  apiKey,
}: LoadCandlesOptions): Promise<LoadCandlesResult> {
  const candidate = configuredSymbol(instrumentId);
  if (!candidate) {
    throw new TwelveDataError('ENTITLEMENT', `No symbol mapping is configured for ${instrumentId}`);
  }

  const now = Date.now();
  const key = cacheKey(candidate.symbol, timeframe);
  const hit = candleCache.get(key);
  if (hit && hit.expiresAt > now) {
    return { candles: sliceTail(hit.result.candles, limit), resolved: resolvedFrom(candidate, hit.result), cached: true };
  }

  const result = await fetchTimeSeries({ symbol: candidate.symbol, timeframe, limit, apiKey });
  candleCache.set(key, { result, expiresAt: now + cacheTtlFor(timeframe) });
  return { candles: sliceTail(result.candles, limit), resolved: resolvedFrom(candidate, result), cached: false };
}

/** The newest `limit` candles of a cached payload, oldest first. */
function sliceTail(candles: TimeSeriesResult['candles'], limit: number): TimeSeriesResult['candles'] {
  if (limit <= 0 || candles.length <= limit) return candles;
  return candles.slice(candles.length - limit);
}

function resolvedFrom(candidate: SymbolCandidate, result: TimeSeriesResult): ResolvedSymbol {
  return {
    candidate,
    vendorSymbol: result.symbol,
    instrumentType: result.instrumentType,
    exchange: result.exchange,
    resolvedAt: Date.now(),
  };
}

/**
 * The current resolution for an instrument, without making a vendor call.
 *
 * The symbol is a configuration fact, so this reports what the app is configured
 * to read whether or not it has been fetched yet. Vendor metadata (instrument
 * type, exchange) is filled in from any cached payload for that symbol.
 */
export function knownResolution(instrumentId: string): ResolvedSymbol | undefined {
  const candidate = configuredSymbol(instrumentId);
  if (!candidate) return undefined;

  const prefix = `${candidate.symbol}|`;
  let cached: TimeSeriesResult | undefined;
  for (const [key, entry] of candleCache) {
    if (key.startsWith(prefix)) {
      cached = entry.result;
      break;
    }
  }

  return {
    candidate,
    vendorSymbol: cached?.symbol ?? candidate.symbol,
    instrumentType: cached?.instrumentType,
    exchange: cached?.exchange,
    resolvedAt: Date.now(),
  };
}
