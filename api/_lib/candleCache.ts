// ============================================
// SERVER-SIDE CANDLE CACHE + SYMBOL RESOLUTION
// ============================================
// Two jobs, both aimed at spending as few Twelve Data credits as possible:
//
//  1. SYMBOL RESOLUTION. An instrument carries an ordered list of candidate
//     symbols (futures first, then a proxy). The first candidate that returns
//     real candles wins, and the choice is remembered so the losers are not
//     re-probed on every request.
//
//  2. CANDLE CACHE. A candle payload for (symbol, timeframe) is reused for a
//     short TTL, so ten users watching ES on M15 share one vendor call instead
//     of ten. The TTL is just under the client poll interval, so a poller still
//     sees new bars promptly.
//
// This module lives in memory, per serverless instance. That is a deliberate
// simplification: it needs no external store, and the worst case when an
// instance is cold is one extra vendor call, not a wrong number. Nothing here
// ever fabricates a candle — a failed lookup returns an error, never a series.

import { fetchTimeSeries, TwelveDataError, type TimeSeriesResult, type VendorErrorKind } from './twelvedata.js';
import { candidatesFor, type SymbolCandidate } from './symbols.js';
import { cacheTtlFor, SYMBOL_RESOLUTION_TTL_MS } from '../../src/core/providers/polling.js';
import type { Timeframe } from '../../src/core/types.js';

export interface ResolvedSymbol {
  candidate: SymbolCandidate;
  /** The symbol string the vendor actually echoed back. */
  vendorSymbol: string;
  /** Vendor-reported instrument type, when present. */
  instrumentType?: string;
  exchange?: string;
  resolvedAt: number;
  /** Candidates that were tried and failed before this one worked. */
  tried: Array<{ symbol: string; reason: string }>;
}

const resolutionCache = new Map<string, ResolvedSymbol>();
const candleCache = new Map<string, { result: TimeSeriesResult; expiresAt: number }>();

/** Test seam: forget everything cached. */
export function clearServerCaches(): void {
  resolutionCache.clear();
  candleCache.clear();
}

function cacheKey(symbol: string, timeframe: string, limit: number): string {
  return `${symbol}|${timeframe}|${limit}`;
}

function resolutionValid(entry: ResolvedSymbol | undefined, now: number): entry is ResolvedSymbol {
  return Boolean(entry) && now - entry!.resolvedAt < SYMBOL_RESOLUTION_TTL_MS;
}

/** Walk an instrument's candidates and return the first that yields candles. */
async function resolveCandidate(
  instrumentId: string,
  timeframe: string,
  limit: number,
  apiKey: string
): Promise<{ resolved: ResolvedSymbol; result: TimeSeriesResult }> {
  const candidates = candidatesFor(instrumentId);
  if (candidates.length === 0) {
    throw new TwelveDataError('ENTITLEMENT', `No symbol mapping is configured for ${instrumentId}`);
  }

  const tried: Array<{ symbol: string; reason: string; kind: VendorErrorKind }> = [];

  for (const candidate of candidates) {
    try {
      const result = await fetchTimeSeries({ symbol: candidate.symbol, timeframe, limit, apiKey });
      if (result.candles.length === 0) {
        // Real, honest outcome: the symbol exists but has no bars here.
        tried.push({ symbol: candidate.symbol, reason: 'no candles returned', kind: 'ENTITLEMENT' });
        continue;
      }
      return {
        resolved: {
          candidate,
          vendorSymbol: result.symbol,
          instrumentType: result.instrumentType,
          exchange: result.exchange,
          resolvedAt: Date.now(),
          tried: tried.map(({ symbol, reason }) => ({ symbol, reason })),
        },
        result,
      };
    } catch (error) {
      const kind = error instanceof TwelveDataError ? error.kind : 'UPSTREAM';
      const message = error instanceof Error ? error.message : 'unknown error';
      // A rate limit is not the symbol's fault, and moving to the next
      // candidate would just burn another blocked call. Stop and report it.
      if (kind === 'RATE_LIMIT' || kind === 'NETWORK') throw error;
      tried.push({ symbol: candidate.symbol, reason: message, kind });
    }
  }

  const detail = tried.map(t => `${t.symbol}: ${t.reason}`).join('; ');
  // Report the real cause. Only call it an entitlement problem when at least
  // one candidate was actually refused; if every candidate failed because the
  // key is bad or the vendor is down, saying "not supported on your plan"
  // would send the user chasing the wrong problem.
  const kind: VendorErrorKind = tried.some(t => t.kind === 'ENTITLEMENT') ? 'ENTITLEMENT' : 'UPSTREAM';
  throw new TwelveDataError(kind, `No symbol for ${instrumentId} returned data (${detail || 'no candidates'})`);
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
 * Candles for an instrument, resolving the symbol on first use and serving from
 * cache while the TTL holds.
 */
export async function loadCandles({
  instrumentId,
  timeframe,
  limit,
  apiKey,
}: LoadCandlesOptions): Promise<LoadCandlesResult> {
  const now = Date.now();

  // 1. Serve from cache when we already know the symbol and the TTL holds.
  const known = resolutionCache.get(instrumentId);
  if (resolutionValid(known, now)) {
    const key = cacheKey(known.candidate.symbol, timeframe, limit);
    const hit = candleCache.get(key);
    if (hit && hit.expiresAt > now) {
      return { candles: hit.result.candles, resolved: known, cached: true };
    }
    try {
      const result = await fetchTimeSeries({
        symbol: known.candidate.symbol,
        timeframe,
        limit,
        apiKey,
      });
      if (result.candles.length > 0) {
        candleCache.set(key, { result, expiresAt: now + cacheTtlFor(timeframe) });
        return { candles: result.candles, resolved: known, cached: false };
      }
      // The symbol we trusted has gone quiet (a weekend, or an expiry). Drop the
      // resolution and fall through to a full re-probe rather than reporting an
      // empty series.
      resolutionCache.delete(instrumentId);
    } catch (error) {
      if (error instanceof TwelveDataError && error.kind === 'ENTITLEMENT') {
        resolutionCache.delete(instrumentId);
      } else {
        throw error;
      }
    }
  }

  // 2. Resolve from scratch.
  const { resolved, result } = await resolveCandidate(instrumentId, timeframe, limit, apiKey);
  resolutionCache.set(instrumentId, resolved);
  candleCache.set(cacheKey(resolved.candidate.symbol, timeframe, limit), {
    result,
    expiresAt: now + cacheTtlFor(timeframe),
  });
  return { candles: result.candles, resolved, cached: false };
}

/** The current resolution for an instrument, without making a vendor call. */
export function knownResolution(instrumentId: string): ResolvedSymbol | undefined {
  const entry = resolutionCache.get(instrumentId);
  return resolutionValid(entry, Date.now()) ? entry : undefined;
}
