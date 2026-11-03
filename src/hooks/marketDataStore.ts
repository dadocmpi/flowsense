// ============================================
// MARKET DATA STORE (client)
// ============================================
// A single, reactive store of candle series keyed by `asset:timeframe`. It exists
// so the whole app can LOAD EVERYTHING ON OPEN without every component fetching
// on its own:
//
//   * one load plan fills the store once, and every component reads from it
//   * state is INDEPENDENT per (asset, timeframe): one failed load never blocks
//     another, and each asset shows as soon as its own series arrives
//   * switching asset or timeframe is instant and costs nothing, because the
//     series is already in memory
//
// The load plan is deliberately cheap. Alpaca is metered by REQUESTS, so all its
// assets for one timeframe arrive in ONE multi-symbol request — seven timeframes
// are seven requests for every Alpaca asset, not one per asset. Twelve Data is
// metered by credits, so its assets are queued one call at a time through the
// server's credit meter, which is the existing queue and is not bypassed.
//
// Nothing here fabricates data. A failed load records an error for that exact
// (asset, timeframe) and leaves the series empty; it is never padded or filled.

import type { Candle, Timeframe } from '../core/types';
import { TIMEFRAMES } from '../core/types';
import { ALL_INSTRUMENTS } from '../core/instruments';
import { futuresProvider, loadAlpacaBatch, ProviderError, type ProviderErrorKind } from '../core/providers';

export interface StoreError {
  kind: ProviderErrorKind;
  message: string;
  retryAfterMs?: number;
}

export type SeriesState = 'idle' | 'loading' | 'loaded' | 'error';

export interface SeriesEntry {
  candles: Candle[];
  state: SeriesState;
  /** Epoch ms the series was last written from a real response. */
  loadedAt: number | null;
  error: StoreError | null;
}

const entries = new Map<string, SeriesEntry>();
const listeners = new Set<() => void>();
let version = 0;

export function seriesKey(instrumentId: string, timeframe: Timeframe): string {
  return `${instrumentId}:${timeframe}`;
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A monotonically increasing version, so React can detect a store change. */
export function getVersion(): number {
  return version;
}

export function getEntry(instrumentId: string, timeframe: Timeframe): SeriesEntry | undefined {
  return entries.get(seriesKey(instrumentId, timeframe));
}

export function getSeries(instrumentId: string, timeframe: Timeframe): Candle[] | undefined {
  return entries.get(seriesKey(instrumentId, timeframe))?.candles;
}

/** Every series for one asset, as the shape the readings hook expects. */
export function seriesByTimeframe(instrumentId: string): Partial<Record<Timeframe, Candle[]>> {
  const out: Partial<Record<Timeframe, Candle[]>> = {};
  for (const timeframe of TIMEFRAMES) {
    const entry = entries.get(seriesKey(instrumentId, timeframe));
    if (entry && entry.candles.length > 0) out[timeframe] = entry.candles;
  }
  return out;
}

/** The timeframes with a loaded series for one asset. */
export function loadedTimeframes(instrumentId: string): Timeframe[] {
  return TIMEFRAMES.filter(timeframe => (entries.get(seriesKey(instrumentId, timeframe))?.candles.length ?? 0) > 0);
}

function write(instrumentId: string, timeframe: Timeframe, patch: Partial<SeriesEntry>): void {
  const key = seriesKey(instrumentId, timeframe);
  const previous: SeriesEntry = entries.get(key) ?? { candles: [], state: 'idle', loadedAt: null, error: null };
  entries.set(key, { ...previous, ...patch });
}

/** Record that a series is being loaded. */
export function markLoading(instrumentId: string, timeframe: Timeframe): void {
  write(instrumentId, timeframe, { state: 'loading' });
  notify();
}

/** Store a freshly loaded series. An empty series is a real "no bars here". */
export function setSeries(instrumentId: string, timeframe: Timeframe, candles: Candle[]): void {
  write(instrumentId, timeframe, { candles, state: 'loaded', loadedAt: Date.now(), error: null });
  notify();
}

/** Record a load failure for exactly one (asset, timeframe). */
export function setError(instrumentId: string, timeframe: Timeframe, error: StoreError): void {
  write(instrumentId, timeframe, { state: 'error', error, loadedAt: null });
  notify();
}

/** Replace the live tail of one series (keeps the entry's loadedAt as-is). */
export function patchSeries(instrumentId: string, timeframe: Timeframe, candles: Candle[]): void {
  const key = seriesKey(instrumentId, timeframe);
  const previous = entries.get(key);
  if (!previous) return;
  entries.set(key, { ...previous, candles });
  notify();
}

/** Test seam: forget everything. */
export function clearMarketStore(): void {
  entries.clear();
  version = 0;
  notify();
}

// ============================================
// LOAD PLAN — everything, on open, once
// ============================================

/** The base timeframe the live tail is merged from. */
const BASE_TIMEFRAME: Timeframe = '1m';
const BASE_CANDLE_LIMIT = 1000;
const TIMEFRAME_CANDLE_LIMIT = 300;
/** Twelve Data retries a rate-limited timeframe after the reset, bounded. */
const MAX_RATE_LIMIT_RETRIES = 4;

function limitFor(timeframe: Timeframe): number {
  return timeframe === BASE_TIMEFRAME ? BASE_CANDLE_LIMIT : TIMEFRAME_CANDLE_LIMIT;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let fullLoadStarted = false;

/**
 * Kick off the full load once per page. Idempotent: a second call is a no-op, so
 * mounting several components does not multiply the vendor calls.
 */
export function ensureFullLoad(): void {
  if (fullLoadStarted) return;
  fullLoadStarted = true;
  void runFullLoad();
}

/** Test seam: allow the full load to run again. */
export function resetFullLoad(): void {
  fullLoadStarted = false;
}

async function runFullLoad(): Promise<void> {
  // Alpaca: one request per timeframe covers every Alpaca asset at once. These
  // are independent of each other and of the Twelve Data queue.
  for (const timeframe of TIMEFRAMES) {
    void loadAlpacaTimeframe(timeframe);
  }

  // Twelve Data: queued one call at a time through the server's credit meter.
  void runTwelveDataQueue();
}

async function loadAlpacaTimeframe(timeframe: Timeframe): Promise<void> {
  const alpacaIds = ALL_INSTRUMENTS.filter(i => i.providerId === 'alpaca').map(i => i.id);
  for (const id of alpacaIds) markLoading(id, timeframe);

  try {
    const { byInstrument } = await loadAlpacaBatch(timeframe, limitFor(timeframe));
    for (const id of alpacaIds) {
      const result = byInstrument[id];
      if (!result) {
        // The route did not report this asset; that is an error for it alone.
        setError(id, timeframe, { kind: 'UNKNOWN', message: 'The batch response did not include this asset' });
        continue;
      }
      if ('candles' in result) setSeries(id, timeframe, result.candles);
      else setError(id, timeframe, toStoreError(result.error));
    }
  } catch (error) {
    // A whole-batch failure (network, or a provider-wide error) is reported for
    // each asset it would have covered; one asset's error never blocks another.
    const storeError = toStoreError(error);
    for (const id of alpacaIds) setError(id, timeframe, storeError);
  }
}

async function runTwelveDataQueue(): Promise<void> {
  const twelveIds = ALL_INSTRUMENTS.filter(i => i.providerId === 'twelvedata').map(i => i.id);

  // One sequential queue over every (Twelve Data asset, timeframe). Sequential
  // because each call spends a credit and the meter is per-minute; running them
  // in parallel would only race into the same ceiling.
  const jobs: Array<{ id: string; timeframe: Timeframe }> = [];
  for (const timeframe of TIMEFRAMES) {
    for (const id of twelveIds) jobs.push({ id, timeframe });
  }

  for (const job of jobs) {
    await loadTwelveData(job.id, job.timeframe);
  }
}

async function loadTwelveData(instrumentId: string, timeframe: Timeframe, attempt = 0): Promise<void> {
  const instrument = ALL_INSTRUMENTS.find(i => i.id === instrumentId);
  if (!instrument) return;

  markLoading(instrumentId, timeframe);
  try {
    const candles = await futuresProvider.getCandles(instrument, timeframe, limitFor(timeframe));
    setSeries(instrumentId, timeframe, candles);
  } catch (error) {
    const storeError = toStoreError(error);
    if (storeError.kind === 'RATE_LIMIT' && attempt < MAX_RATE_LIMIT_RETRIES) {
      // The credit meter blocked the call. Wait out the reset the server
      // reported, then continue the queue — this is the one retry path, and it
      // is bounded, so it can never become a loop.
      const delay = Math.max(storeError.retryAfterMs ?? 60_000, 1_000) + 250;
      await wait(delay);
      return loadTwelveData(instrumentId, timeframe, attempt + 1);
    }
    setError(instrumentId, timeframe, storeError);
  }
}

function toStoreError(error: unknown): StoreError {
  if (error instanceof ProviderError) {
    return {
      kind: error.kind,
      message: error.message,
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'UNKNOWN', message: 'Request cancelled' };
  }
  return { kind: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown error' };
}
