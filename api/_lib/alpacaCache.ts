// ============================================
// SERVER-SIDE ALPACA CANDLE CACHE
// ============================================
// One job: a candle payload for (symbol, timeframe) is reused for a short TTL,
// so concurrent users share one Alpaca request instead of one each. Alpaca is
// metered by REQUESTS, not credits, so the cache is what keeps a busy page from
// spending the per-minute request budget.
//
// A multi-symbol load (all Alpaca assets for one timeframe) is ONE request that
// fills the per-symbol cache, so a later single-asset fetch for the same
// timeframe is served from memory and costs nothing.
//
// The cache key deliberately EXCLUDES the requested bar count: a caller asking
// for two bars is served a slice of the payload a caller asking for hundreds
// already paid for. Nothing here ever fabricates a candle — a failed lookup
// returns an error, never a series.

import { fetchAlpacaBars, AlpacaError } from './alpaca.js';
import type { Candle } from '../../src/core/types.js';
import { assetProviderConfig, CONFIGURED_ASSET_IDS } from './assets.js';
import { cacheTtlForProvider } from '../../src/core/providers/polling.js';
import type { Timeframe } from '../../src/core/types.js';

const candleCache = new Map<string, { candles: Candle[]; expiresAt: number }>();

/** Test seam: forget everything cached. */
export function clearAlpacaCache(): void {
  candleCache.clear();
}

function cacheKey(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

function sliceTail(candles: Candle[], limit: number): Candle[] {
  if (limit <= 0 || candles.length <= limit) return candles;
  return candles.slice(candles.length - limit);
}

/** The Alpaca-backed assets, as `{ instrumentId, symbol }`, in display order. */
export function alpacaAssets(): Array<{ instrumentId: string; symbol: string }> {
  return CONFIGURED_ASSET_IDS.map(id => {
    const config = assetProviderConfig(id);
    return config && config.provider === 'alpaca' ? { instrumentId: id, symbol: config.symbol } : null;
  }).filter((entry): entry is { instrumentId: string; symbol: string } => entry !== null);
}

export interface LoadAlpacaCandlesOptions {
  instrumentId: string;
  timeframe: Timeframe;
  limit: number;
  keyId: string;
  secretKey: string;
  signal?: AbortSignal;
}

export interface LoadAlpacaCandlesResult {
  candles: Candle[];
  symbol: string;
  cached: boolean;
}

/**
 * Candles for one Alpaca-backed asset. One request per (symbol, timeframe) per
 * cache TTL, and a multi-symbol request can fill several of these at once.
 */
export async function loadAlpacaCandles({
  instrumentId,
  timeframe,
  limit,
  keyId,
  secretKey,
  signal,
}: LoadAlpacaCandlesOptions): Promise<LoadAlpacaCandlesResult> {
  const config = assetProviderConfig(instrumentId);
  if (!config || config.provider !== 'alpaca') {
    throw new AlpacaError('SYMBOL_NOT_FOUND', `No Alpaca mapping is configured for ${instrumentId}`);
  }

  const symbol = config.symbol;
  const now = Date.now();
  const key = cacheKey(symbol, timeframe);
  const hit = candleCache.get(key);
  if (hit && hit.expiresAt > now) {
    return { candles: sliceTail(hit.candles, limit), symbol, cached: true };
  }

  const { candlesBySymbol } = await fetchAlpacaBars({
    symbols: [symbol],
    timeframe,
    limit,
    keyId,
    secretKey,
    signal,
  });
  const candles = candlesBySymbol[symbol] ?? [];
  candleCache.set(key, { candles, expiresAt: now + cacheTtlForProvider('alpaca', timeframe) });
  return { candles: sliceTail(candles, limit), symbol, cached: false };
}

export interface LoadAlpacaBatchResult {
  /** Candles per instrument id, each already sliced to `limit`. */
  byInstrument: Record<string, Candle[]>;
  /** True when every requested instrument was served from cache. */
  cached: boolean;
}

/**
 * Candles for every Alpaca-backed asset on one timeframe, in ONE request.
 *
 * This is what makes a full load cheap: seven timeframes are seven requests in
 * total for all Alpaca assets, not one request per asset per timeframe. Symbols
 * already cached are skipped, so a repeat load costs nothing.
 */
export async function loadAlpacaCandlesBatch({
  timeframe,
  limit,
  keyId,
  secretKey,
  signal,
}: {
  timeframe: Timeframe;
  limit: number;
  keyId: string;
  secretKey: string;
  signal?: AbortSignal;
}): Promise<LoadAlpacaBatchResult> {
  const assets = alpacaAssets();
  const now = Date.now();

  const byInstrument: Record<string, Candle[]> = {};
  const missing: string[] = [];
  let anyFetched = false;

  for (const { instrumentId, symbol } of assets) {
    const hit = candleCache.get(cacheKey(symbol, timeframe));
    if (hit && hit.expiresAt > now) {
      byInstrument[instrumentId] = sliceTail(hit.candles, limit);
    } else {
      missing.push(symbol);
    }
  }

  if (missing.length > 0) {
    anyFetched = true;
    const { candlesBySymbol } = await fetchAlpacaBars({
      symbols: missing,
      timeframe,
      limit,
      keyId,
      secretKey,
      signal,
    });
    const expiresAt = Date.now() + cacheTtlForProvider('alpaca', timeframe);
    for (const { instrumentId, symbol } of assets) {
      if (!missing.includes(symbol)) continue;
      const candles = candlesBySymbol[symbol] ?? [];
      candleCache.set(cacheKey(symbol, timeframe), { candles, expiresAt });
      byInstrument[instrumentId] = sliceTail(candles, limit);
    }
  }

  return { byInstrument, cached: !anyFetched };
}

/**
 * What an asset is configured to read, without making a vendor call. The symbol
 * is a configuration fact, so it is always known.
 */
export function knownAlpacaResolution(instrumentId: string): { symbol: string } | undefined {
  const config = assetProviderConfig(instrumentId);
  if (!config || config.provider !== 'alpaca') return undefined;
  return { symbol: config.symbol };
}
