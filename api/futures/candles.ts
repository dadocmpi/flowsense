// ============================================
// GET /api/futures/candles
// ============================================
// Server-side only. Holds the vendor API keys and returns real candles for an
// instrument. The browser never sees a key.
//
// Query:
//   instrument, timeframe, limit   -> candles for one asset
//   assets=1, timeframe, limit     -> candles for EVERY Alpaca asset on one
//                                     timeframe in one vendor request (the
//                                     load-everything path)
//
// WHICH provider serves an asset is a configuration fact (api/_lib/assets.ts),
// not a property of this route: Gold reads Twelve Data (XAU/USD), the index
// assets read Alpaca (SPY/DIA/QQQ). Switching an asset needs only a config
// change. The payload says which provider answered so the client can label the
// provenance honestly.
//
// There is no symbol fallback: a symbol that fails returns an error for that
// asset rather than spending more credits trying another.
//
// Every vendor call goes through that provider's rate meter, which is why this
// route never reaches a vendor once the minute is spent: it answers with
// RATE_LIMIT and a `retryAfterMs`, and the client shows "Rate limit — retrying
// in Xs" with the last cached data marked stale.
//
// Response (single): { ok: true, candles, source, symbol, interval, symbolKind,
//   symbolLabel, isProxy, provider, feed, ... }
// Response (batch): { ok: true, assets: { <id>: <single-shaped payload> } }

import {
  alpacaConfigured,
  alpacaKeyId,
  alpacaSecretKey,
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
import { loadAlpacaCandles, loadAlpacaCandlesBatch, alpacaAssets } from '../_lib/alpacaCache.js';
import type { Timeframe } from '../../src/core/types.js';
import { TIMEFRAMES } from '../../src/core/types.js';
import { TwelveDataError } from '../_lib/twelvedata.js';
import { AlpacaError } from '../_lib/alpaca.js';
import { CreditLimitError, meterSnapshot } from '../_lib/creditMeter.js';
import { alpacaMeterSnapshot } from '../_lib/alpacaMeter.js';
import { assetProvider, assetProviderConfig } from '../_lib/assets.js';
import { configuredSymbol } from '../_lib/symbols.js';

const MAX_LIMIT = 1000;

/** Reject an unknown timeframe rather than silently substituting one. */
function asTimeframe(value: string): Timeframe | null {
  return (TIMEFRAMES as string[]).includes(value) ? (value as Timeframe) : null;
}

/** Map a Twelve Data error kind onto the ProviderErrorKind the client renders. */
function twelveDataErrorKindFor(error: unknown): string {
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

/** Map an Alpaca error kind onto the ProviderErrorKind the client renders. */
function alpacaErrorKindFor(error: unknown): string {
  if (error instanceof AlpacaError) {
    switch (error.kind) {
      case 'RATE_LIMIT':
        return 'RATE_LIMIT';
      case 'NETWORK':
        return 'NETWORK';
      case 'SYMBOL_NOT_FOUND':
        return 'SYMBOL_NOT_FOUND';
      case 'SUBSCRIPTION':
        return 'SUBSCRIPTION';
      case 'AUTH':
        return 'AUTH';
      default:
        return 'UPSTREAM';
    }
  }
  if (error instanceof CreditLimitError) return 'RATE_LIMIT';
  return 'UPSTREAM';
}

/** Epoch ms a blocked caller may retry, from the error or the meter itself. */
function retryAfterMsFor(error: unknown, provider: string): number | undefined {
  if (error instanceof TwelveDataError && error.kind === 'RATE_LIMIT') {
    const fromError = error.retryAfterMs;
    const fromMeter = Math.max(0, meterSnapshot().resetAt - Date.now());
    return Math.max(0, fromError ?? fromMeter);
  }
  if (error instanceof AlpacaError && error.kind === 'RATE_LIMIT') {
    const fromError = error.retryAfterMs;
    const fromMeter = Math.max(0, alpacaMeterSnapshot().resetAt - Date.now());
    return Math.max(0, fromError ?? fromMeter);
  }
  if (error instanceof CreditLimitError) return Math.max(0, error.resetAt - Date.now());
  return undefined;
}

/** The ProviderErrorKind + our own message for any failure. */
function errorFor(error: unknown, provider: string): { kind: string; message: string } {
  const kind = provider === 'alpaca' ? alpacaErrorKindFor(error) : twelveDataErrorKindFor(error);
  // Never the raw vendor text: the client shows our own state, and a rate limit
  // is a countdown, not a vendor message.
  const message = kind === 'RATE_LIMIT' ? 'Rate limit reached' : error instanceof Error ? error.message : 'Request failed';
  return { kind, message };
}

interface SinglePayload {
  ok: boolean;
  candles?: unknown;
  source?: string;
  symbol?: string;
  interval?: string;
  symbolKind?: 'futures' | 'proxy';
  symbolLabel?: string;
  isProxy?: boolean;
  requestedSymbol?: string;
  instrumentType?: string;
  exchange?: string;
  provider?: string;
  /** The feed the numbers came from, e.g. "iex". Alpaca only. */
  feed?: string;
  /** True when the volume is a single exchange's, not consolidated. */
  partialVolume?: boolean;
  cached?: boolean;
  roll?: { method: string; adjustment: string };
  error?: { kind: string; message: string; retryAfterMs?: number };
}

/** Candles for one asset from its configured provider. */
async function loadOne(instrumentId: string, timeframe: Timeframe, limit: number): Promise<SinglePayload> {
  const provider = assetProvider(instrumentId);
  if (!provider) {
    return { ok: false, error: { kind: 'UNSUPPORTED_INSTRUMENT', message: `No provider mapping for ${instrumentId}` } };
  }

  if (provider === 'alpaca') {
    if (!alpacaConfigured()) {
      return { ok: false, error: { kind: 'NOT_CONFIGURED', message: 'No Alpaca data source is configured on the server' } };
    }
    const config = assetProviderConfig(instrumentId);
    if (!config) {
      return { ok: false, error: { kind: 'UNSUPPORTED_INSTRUMENT', message: `No Alpaca symbol for ${instrumentId}` } };
    }
    try {
      const { candles, symbol, cached } = await loadAlpacaCandles({
        instrumentId,
        timeframe,
        limit,
        keyId: alpacaKeyId()!,
        secretKey: alpacaSecretKey()!,
      });
      if (candles.length === 0) {
        return { ok: false, error: { kind: 'SYMBOL_NOT_FOUND', message: `No candles returned for ${symbol}` } };
      }
      return {
        ok: true,
        candles,
        source: `alpaca (${symbol}, ${timeframe}, IEX)`,
        symbol,
        interval: timeframe,
        symbolKind: 'proxy',
        symbolLabel: `${symbol} — index proxy (IEX, partial market volume)`,
        isProxy: true,
        requestedSymbol: symbol,
        provider: 'alpaca',
        feed: 'iex',
        partialVolume: true,
        cached,
      };
    } catch (error) {
      const { kind, message } = errorFor(error, 'alpaca');
      const retryAfterMs = retryAfterMsFor(error, 'alpaca');
      return { ok: false, error: { kind, message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) } };
    }
  }

  // Twelve Data.
  const vendor = resolveVendor();
  const apiKey = vendorApiKey();
  if (!vendor || !apiKey) {
    return { ok: false, error: { kind: 'NOT_CONFIGURED', message: 'No futures data source is configured on the server' } };
  }
  const candidate = configuredSymbol(instrumentId);
  if (!candidate) {
    return { ok: false, error: { kind: 'UNSUPPORTED_INSTRUMENT', message: `No symbol mapping for ${instrumentId}` } };
  }

  try {
    const { candles, resolved, cached } = await loadCandles({ instrumentId, timeframe, limit, apiKey });
    if (candles.length === 0) {
      return { ok: false, error: { kind: 'SYMBOL_NOT_FOUND', message: `No candles returned for ${resolved.candidate.symbol}` } };
    }
    const isProxy = resolved.candidate.kind === 'proxy';
    return {
      ok: true,
      candles,
      source: `${vendor} (${resolved.vendorSymbol}, ${timeframe})`,
      symbol: resolved.vendorSymbol,
      interval: timeframe,
      symbolKind: resolved.candidate.kind,
      symbolLabel: resolved.candidate.description,
      isProxy,
      requestedSymbol: resolved.candidate.symbol,
      instrumentType: resolved.instrumentType,
      exchange: resolved.exchange,
      provider: 'twelvedata',
      cached,
      roll: { method: rollMethod(), adjustment: rollAdjustment() },
    };
  } catch (error) {
    const { kind, message } = errorFor(error, 'twelvedata');
    const retryAfterMs = retryAfterMsFor(error, 'twelvedata');
    return { ok: false, error: { kind, message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) } };
  }
}

/** Every Alpaca asset on one timeframe, in one vendor request. */
async function loadAlpacaBatch(timeframe: Timeframe, limit: number): Promise<Record<string, SinglePayload>> {
  const assets = alpacaAssets();
  const out: Record<string, SinglePayload> = {};

  if (!alpacaConfigured()) {
    for (const { instrumentId } of assets) {
      out[instrumentId] = { ok: false, error: { kind: 'NOT_CONFIGURED', message: 'No Alpaca data source is configured on the server' } };
    }
    return out;
  }

  try {
    const { byInstrument, cached } = await loadAlpacaCandlesBatch({
      timeframe,
      limit,
      keyId: alpacaKeyId()!,
      secretKey: alpacaSecretKey()!,
    });
    for (const { instrumentId, symbol } of assets) {
      const candles = byInstrument[instrumentId] ?? [];
      if (candles.length === 0) {
        out[instrumentId] = { ok: false, error: { kind: 'SYMBOL_NOT_FOUND', message: `No candles returned for ${symbol}` } };
        continue;
      }
      out[instrumentId] = {
        ok: true,
        candles,
        source: `alpaca (${symbol}, ${timeframe}, IEX)`,
        symbol,
        interval: timeframe,
        symbolKind: 'proxy',
        symbolLabel: `${symbol} — index proxy (IEX, partial market volume)`,
        isProxy: true,
        requestedSymbol: symbol,
        provider: 'alpaca',
        feed: 'iex',
        partialVolume: true,
        cached,
      };
    }
  } catch (error) {
    const { kind, message } = errorFor(error, 'alpaca');
    const retryAfterMs = retryAfterMsFor(error, 'alpaca');
    for (const { instrumentId } of assets) {
      out[instrumentId] = { ok: false, error: { kind, message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) } };
    }
  }
  return out;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, errorBody('UNKNOWN', 'Only GET is supported'));
    return;
  }

  const rawTimeframe = first(req.query.timeframe) ?? '5m';
  const limit = Number.parseInt(first(req.query.limit) ?? '300', 10);
  const safeLimit = Math.min(Number.isFinite(limit) ? limit : 300, MAX_LIMIT);

  const timeframe = asTimeframe(rawTimeframe);
  if (!timeframe) {
    sendJson(res, 400, errorBody('UNKNOWN', `Unsupported timeframe: ${rawTimeframe}`));
    return;
  }

  // Batch path: every Alpaca asset on one timeframe, in ONE vendor request.
  // `assets` is the flag the client sends on load; the value is ignored.
  const batch = first(req.query.assets);
  if (batch !== undefined) {
    const payloads = await loadAlpacaBatch(timeframe, safeLimit);
    sendJson(res, 200, { ok: true, provider: 'alpaca', timeframe, assets: payloads });
    return;
  }

  // `instrument` is the app's stable id (GC/ES/YM/NQ); `symbol` is accepted for
  // backwards compatibility with an older client.
  const instrumentId = first(req.query.instrument) ?? first(req.query.symbol);
  if (!instrumentId) {
    sendJson(res, 400, errorBody('UNKNOWN', 'An instrument is required'));
    return;
  }

  const payload = await loadOne(instrumentId.toUpperCase(), timeframe, safeLimit);
  sendJson(res, 200, payload);
}
