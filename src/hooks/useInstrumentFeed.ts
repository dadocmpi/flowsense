// ============================================
// INSTRUMENT FEED HOOK
// ============================================
// The single data entry point for one instrument. It talks to whatever provider
// the instrument declares, and it never invents data:
//
//  * candles come from provider.getCandles, or the feed is unavailable
//  * the live price comes from provider.subscribeTicks when the provider has a
//    tick feed, otherwise it is the last candle close with the fetch time
//
// THE ENTRY CHECK NEEDS ALL SEVEN TIMEFRAMES, so this hook loads all seven for
// the SELECTED asset — one request each, seven credits — rather than one. The
// order is deliberate: the timeframe the user is looking at first, then the rest
// highest-first (1D, 4H, 1H, 30m, 15m, 5m, 1m), one request at a time. Chips fill
// progressively and read "Loading" until their data lands.
//
// CREDIT DISCIPLINE.
//  * Per-timeframe cache keyed by (asset, timeframe) with a TTL from
//    src/config/compass.ts. Within the TTL a timeframe costs NOTHING; switching
//    back to a cached asset costs 0 credits.
//  * In-flight de-duplication, so two callers for one timeframe share one call.
//  * One request at a time, ever.
//  * Background refresh touches ONLY expired timeframes of the selected asset and
//    never runs when the server meter has one credit or fewer left, so a user
//    action always has a credit to spend.
//  * When the meter blocks a timeframe it is marked "Waiting for credits" and the
//    queue resumes automatically after the minute resets. When the VENDOR reports
//    a rate limit every call stops until the minute resets.
//
// ASSETS ARE INDEPENDENT. The hook holds one asset's state; a failure for one
// asset never touches another's, and a failure for one timeframe never blocks the
// others.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../core/types';
import { TIMEFRAMES, TIMEFRAME_MINUTES } from '../core/types';
import type { Instrument, ResolvedSource } from '../core/instruments';
import {
  futuresCreditState,
  ProviderError,
  providerForInstrument,
  probeFuturesProvider,
  resolvedSourceFor,
  type ProviderErrorKind,
  type StreamStatus,
} from '../core/providers';
import { mergeLiveTail, upsertLastCandle } from '../core/candles';
import { marketState, type MarketStateResult } from '../core/marketHours';
import { expiredTimeframes, isFresh as isSeriesFresh, loadOrder, LOAD_PRIORITY } from '../core/feedCache';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';

/** The base timeframe the live tail is merged from. */
export const BASE_TIMEFRAME: Timeframe = '1m';
/**
 * Candles requested per timeframe. At least 250 so EMA 200 is valid; a single
 * request per timeframe, so the wider window costs the same one credit. Every
 * timeframe, including the 1m base, asks for the same window: the live tail
 * merge only needs the base series to reach back to the newest higher-timeframe
 * bucket open, which a few hours of 1m bars covers.
 */
const TIMEFRAME_CANDLE_LIMIT = Math.max(250, DEFAULT_COMPASS_CONFIG.requestedCandles);
/**
 * Timeframes whose bucket boundary lines up with the base series, so their
 * newest bar can be rebuilt from the live base tail. A daily bucket is only
 * merged when the base window actually reaches its open — see mergeLiveTail,
 * which refuses a partial rebuild.
 */
const MERGEABLE_TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1h', '4h', '1D'];
/** The stream pushes far faster than a screen needs to repaint. */
const FLUSH_MS = 200;
/** A tick this old is reported as delayed rather than live. */
const LIVE_AGE_MS = 8_000;
/** A rate limit with no reported reset is retried after this long (ms). */
const RATE_LIMIT_DEFAULT_RETRY_MS = 60_000;
/**
 * Credits the background refresh must leave for a user action. It never runs when
 * the server meter reports this many or fewer credits remaining.
 */
const REFRESH_CREDIT_RESERVE = 1;
/**
 * How long the server cache is assumed to keep a payload. The client TTL is
 * deliberately a touch shorter, so a client refresh that lands inside the server
 * TTL is still served from cache and costs no extra credit.
 */
const CLIENT_TTL_SAFETY_MS = 1_000;

export interface FeedError {
  kind: ProviderErrorKind;
  message: string;
}

/** Per-timeframe load state, so a chip can say exactly where it is. */
export type TimeframeLoadState = 'IDLE' | 'LOADING' | 'READY' | 'WAITING_FOR_CREDITS' | 'ERROR';

export interface TimeframeStatus {
  timeframe: Timeframe;
  state: TimeframeLoadState;
  /** Epoch ms the series was fetched, or null when it has never been. */
  fetchedAt: number | null;
  /** When it next needs a refresh (fetchedAt + TTL), or null when unknown. */
  expiresAt: number | null;
  /** Why it failed, when it did. */
  error: FeedError | null;
}

export interface InstrumentFeed {
  instrument: Instrument;
  /** Base-timeframe series, patched live from ticks. */
  candles: Candle[];
  /**
   * Every timeframe the feed has loaded so far. Each is fetched as its own
   * interval, so a 1m seed cannot cap how far back the daily reaches.
   */
  seriesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  price: number;
  /** Epoch ms of the newest price or candle update. */
  lastUpdate: number | null;
  streamStatus: StreamStatus;
  isLoading: boolean;
  error: FeedError | null;
  /** True when the instrument has a configured data source. */
  configured: boolean;
  /**
   * False when the server's status route could not be reached at all. Distinct
   * from "not configured": a missing api/ deployment or a network blip is not a
   * missing API key, and the UI must not claim one when the other is true.
   */
  sourceReachable: boolean;
  /** Why it is unavailable, when it is. */
  unavailableReason: string | null;
  /** Human label of the source actually serving this instrument. */
  sourceLabel: string;
  /**
   * What the app is really reading. A proxy is labelled as a proxy; the UI must
   * never call it the futures contract.
   */
  resolvedSource: ResolvedSource | null;
  /**
   * Whether the live price arrives as real ticks or as a REST poll. A polled
   * feed is delayed by definition and the UI says so.
   */
  feedMode: 'STREAM' | 'POLL' | 'NONE';
  /** Whether the market is still producing bars, and why. */
  market: MarketStateResult;
  /** Bumped whenever a candle series changes, for downstream memo keys. */
  revision: number;
  /** Per-timeframe load state for the SELECTED asset, in canonical order. */
  timeframeStatus: Record<Timeframe, TimeframeStatus>;
  /** Timeframes with a request in flight. */
  loadingTimeframes: Timeframe[];
  /** Timeframes fetched and not yet expired. */
  loadedTimeframes: Timeframe[];
  /** Timeframes the meter refused; they resume after the minute resets. */
  waitingTimeframes: Timeframe[];
  /** Per-timeframe fetch time, for a chip's data age. */
  fetchedAtByTimeframe: Partial<Record<Timeframe, number>>;
  /**
   * True when the data on screen is the last known good series because the
   * vendor's credit limit blocked a fresh fetch. The UI marks it stale.
   */
  stale: boolean;
  /** Epoch ms the rate limit resets, when one is in force. */
  rateLimitedUntil: number | null;
}

function toFeedError(error: unknown): FeedError {
  if (error instanceof ProviderError) return { kind: error.kind, message: error.message };
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'UNKNOWN', message: 'Request cancelled' };
  }
  return { kind: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown error' };
}

/** One cached timeframe series, with the time it was fetched. */
interface CachedTimeframe {
  series: Candle[];
  fetchedAt: number;
}

/**
 * Candle cache shared across hook instances, keyed by asset then timeframe.
 *
 * This is what makes switching back to an asset already loaded cost 0 credits:
 * the series is still here, with the time it was fetched, so the hook can decide
 * per timeframe whether it is still inside its TTL.
 */
const candleCache = new Map<string, Partial<Record<Timeframe, CachedTimeframe>>>();

export function clearCandleCache(): void {
  candleCache.clear();
}

/** The in-flight request per `asset:timeframe`, so two callers share one call. */
const inflight = new Map<string, Promise<Candle[]>>();

function cacheKeyFor(instrumentId: string, timeframe: Timeframe): string {
  return `${instrumentId}:${timeframe}`;
}

function limitFor(_timeframe: Timeframe): number {
  return TIMEFRAME_CANDLE_LIMIT;
}

/** The per-timeframe TTL, from the one config that defines it. */
function ttlFor(timeframe: Timeframe): number {
  return DEFAULT_COMPASS_CONFIG.timeframeTtlMs[timeframe] ?? 60_000;
}

/** True when a cached series is still inside its TTL at `now`. */
function isFresh(entry: CachedTimeframe | undefined, timeframe: Timeframe, now: number): boolean {
  return isSeriesFresh(entry?.fetchedAt, ttlFor(timeframe), now, CLIENT_TTL_SAFETY_MS);
}

/** Build the per-timeframe status map from a cache, for a fresh instrument. */
function initialStatuses(cache: Partial<Record<Timeframe, CachedTimeframe>>): Record<Timeframe, TimeframeStatus> {
  const out = {} as Record<Timeframe, TimeframeStatus>;
  for (const timeframe of TIMEFRAMES) {
    const entry = cache[timeframe];
    out[timeframe] = entry
      ? {
          timeframe,
          state: 'READY',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.fetchedAt + ttlFor(timeframe),
          error: null,
        }
      : { timeframe, state: 'IDLE', fetchedAt: null, expiresAt: null, error: null };
  }
  return out;
}

export function useInstrumentFeed(instrument: Instrument, selectedTimeframe: Timeframe): InstrumentFeed {
  const provider = providerForInstrument(instrument);

  const initialCache = candleCache.get(instrument.id) ?? {};
  const [cached, setCached] = useState<Partial<Record<Timeframe, CachedTimeframe>>>(() => initialCache);
  const [statuses, setStatuses] = useState<Record<Timeframe, TimeframeStatus>>(() => initialStatuses(initialCache));
  const [price, setPrice] = useState<number>(() => {
    const base = initialCache[BASE_TIMEFRAME]?.series ?? [];
    return base.length > 0 ? base[base.length - 1].close : 0;
  });
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('CONNECTING');
  const [error, setError] = useState<FeedError | null>(null);
  const [configured, setConfigured] = useState<boolean>(provider ? provider.isConfigured() : false);
  const [sourceReachable, setSourceReachable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [loadingTimeframes, setLoadingTimeframes] = useState<Timeframe[]>([]);

  // ---- Refs holding the authoritative, synchronously-readable state --------
  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const cacheRef = useRef<Partial<Record<Timeframe, CachedTimeframe>>>(initialCache);
  const pendingRef = useRef<Timeframe[]>([]);
  const inFlightRef = useRef<Set<Timeframe>>(new Set());
  const pumpingRef = useRef(false);
  const rateLimitedUntilRef = useRef<number | null>(null);
  /**
   * Timeframes that failed with a NON-retryable cause (a symbol/plan problem).
   * They are never re-queued automatically: a plan error does not fix itself, and
   * retrying it in a loop is exactly how a free plan's minute gets burned. The set
   * is cleared when the asset changes, so re-selecting the asset retries once.
   */
  const nonRetryableRef = useRef<Set<Timeframe>>(new Set());
  const meterResetRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candlesRef = useRef<Candle[]>(initialCache[BASE_TIMEFRAME]?.series ?? []);
  const priceRef = useRef<number>(price);
  const dirtyRef = useRef(false);
  const activeInstrumentRef = useRef(instrument.id);

  const setStatus = useCallback((timeframe: Timeframe, patch: Partial<TimeframeStatus>) => {
    setStatuses(prev => ({ ...prev, [timeframe]: { ...prev[timeframe], timeframe, ...patch } }));
  }, []);

  // ---- The one-at-a-time loader -------------------------------------------
  const scheduleResume = useCallback((at: number) => {
    if (resumeTimerRef.current !== null) return;
    const delay = Math.max(0, at - Date.now()) + 250;
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      rateLimitedUntilRef.current = null;
      meterResetRef.current = null;
      setRateLimitedUntil(null);
      void pumpRef.current();
    }, delay);
  }, []);

  const fetchOne = useCallback(
    async (timeframe: Timeframe) => {
      const activeProvider = providerRef.current;
      const activeInstrument = instrumentRef.current;
      if (!activeProvider) return;

      inFlightRef.current.add(timeframe);
      setLoadingTimeframes([...inFlightRef.current]);
      setStatus(timeframe, { state: 'LOADING', error: null });

      try {
        const series = await activeProvider.getCandles(
          activeInstrument,
          timeframe,
          limitFor(timeframe)
        );

        const fetchedAt = Date.now();
        const nextCache = { ...cacheRef.current, [timeframe]: { series, fetchedAt } };
        cacheRef.current = nextCache;
        candleCache.set(activeInstrument.id, nextCache);
        setCached(nextCache);

        // The price is the newest real close we have. An empty series leaves the
        // price alone rather than inventing one.
        if (series.length > 0) priceRef.current = series[series.length - 1].close;
        if (timeframe === BASE_TIMEFRAME) candlesRef.current = series;
        setPrice(priceRef.current);
        setLastUpdate(fetchedAt);
        setError(null);
        setConfigured(true);
        setSourceReachable(true);
        setUnavailableReason(null);
        setRevision(r => r + 1);

        setStatus(timeframe, {
          state: 'READY',
          fetchedAt,
          expiresAt: fetchedAt + ttlFor(timeframe),
          error: null,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const feedError = toFeedError(err);
        const retryAfterMs = err instanceof ProviderError ? err.retryAfterMs : undefined;

        if (feedError.kind === 'NOT_CONFIGURED') setConfigured(false);

        if (feedError.kind === 'RATE_LIMIT' || feedError.kind === 'CREDIT_LIMIT') {
          // Both mean "no credit right now", but they are different states:
          //  * RATE_LIMIT   the vendor said stop — nothing may be called until
          //                 the minute resets, so the whole queue pauses.
          //  * CREDIT_LIMIT our own meter refused the call before it was made —
          //                 the timeframe waits and resumes at the reset.
          const until =
            Date.now() +
            Math.max(retryAfterMs ?? 0, feedError.kind === 'RATE_LIMIT' ? RATE_LIMIT_DEFAULT_RETRY_MS : 1_000);
          if (feedError.kind === 'RATE_LIMIT') {
            rateLimitedUntilRef.current = until;
            setRateLimitedUntil(until);
          } else {
            meterResetRef.current = until;
          }
          setStatus(timeframe, { state: 'WAITING_FOR_CREDITS', error: feedError });
          // Put it back at the front: it is the next thing to try after the reset.
          pendingRef.current = [timeframe, ...pendingRef.current.filter(tf => tf !== timeframe)];
          scheduleResume(until);
        } else {
          // A symbol/plan problem or an upstream failure is NOT retried in a
          // loop. The timeframe is reported and left alone. A plan problem is
          // additionally marked non-retryable, so even a re-run of the load
          // effect will not spend another credit on it.
          if (feedError.kind === 'SYMBOL_NOT_FOUND' || feedError.kind === 'NOT_CONFIGURED') {
            nonRetryableRef.current.add(timeframe);
          }
          setStatus(timeframe, { state: 'ERROR', error: feedError });
          setError(feedError);
        }
      } finally {
        inFlightRef.current.delete(timeframe);
        setLoadingTimeframes([...inFlightRef.current]);
      }
    },
    [scheduleResume, setStatus]
  );

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      for (;;) {
        const now = Date.now();
        // A vendor rate limit pauses EVERYTHING until the minute resets.
        if (rateLimitedUntilRef.current !== null && rateLimitedUntilRef.current > now) {
          scheduleResume(rateLimitedUntilRef.current);
          return;
        }
        // The meter's own block clears at the same boundary.
        if (meterResetRef.current !== null && meterResetRef.current > now) {
          scheduleResume(meterResetRef.current);
          return;
        }
        rateLimitedUntilRef.current = null;
        meterResetRef.current = null;

        const next = pendingRef.current.shift();
        if (!next) return;
        if (inFlightRef.current.has(next)) continue;
        // Already fresh in the cache: no vendor call, and mark it ready.
        if (isFresh(cacheRef.current[next], next, Date.now())) {
          const entry = cacheRef.current[next]!;
          setStatus(next, { state: 'READY', fetchedAt: entry.fetchedAt, expiresAt: entry.fetchedAt + ttlFor(next), error: null });
          continue;
        }
        await fetchOne(next);
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [fetchOne, scheduleResume, setStatus]);

  // A ref so scheduleResume's timer can call the latest pump without a cycle.
  const pumpRef = useRef(pump);
  pumpRef.current = pump;

  // The auto-refresh interval reads the status map to decide what is worth
  // refreshing, so it needs the current value without re-subscribing every render.
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const enqueue = useCallback((timeframes: Timeframe[]) => {
    let added = false;
    for (const timeframe of timeframes) {
      if (pendingRef.current.includes(timeframe)) continue;
      if (inFlightRef.current.has(timeframe)) continue;
      // A plan problem does not fix itself; never spend a credit on it again
      // until the asset changes.
      if (nonRetryableRef.current.has(timeframe)) continue;
      pendingRef.current.push(timeframe);
      added = true;
    }
    if (added) void pumpRef.current();
  }, []);

  // ---- The server-side fact: is a source configured? ----------------------
  useEffect(() => {
    if (!provider || provider.id !== 'futures') {
      setConfigured(provider ? provider.isConfigured() : false);
      setSourceReachable(true);
      setUnavailableReason(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    probeFuturesProvider(controller.signal)
      .then(result => {
        if (!active) return;
        setConfigured(result.configured);
        setSourceReachable(result.reachable);
        setUnavailableReason(result.configured ? null : result.note ?? null);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(false);
        setSourceReachable(false);
        setUnavailableReason('Could not reach the futures status route');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [provider]);

  // ---- Reset on an asset change, then load all seven timeframes -----------
  // One effect, so the order is unambiguous: restore what is cached for this
  // asset, then queue its timeframes. The selected timeframe goes first so the
  // compasses and the table fill immediately; the rest follow highest-first, one
  // request at a time. Fresh timeframes are skipped by the pump for free.
  useEffect(() => {
    if (activeInstrumentRef.current !== instrument.id) {
      activeInstrumentRef.current = instrument.id;

      if (resumeTimerRef.current !== null) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      pendingRef.current = [];
      inFlightRef.current.clear();
      nonRetryableRef.current.clear();
      rateLimitedUntilRef.current = null;
      meterResetRef.current = null;
      pumpingRef.current = false;

      const restored = candleCache.get(instrument.id) ?? {};
      cacheRef.current = restored;
      setCached(restored);
      setStatuses(initialStatuses(restored));
      setLoadingTimeframes([]);
      setRateLimitedUntil(null);
      setError(null);

      const base = restored[BASE_TIMEFRAME]?.series ?? [];
      candlesRef.current = base;
      priceRef.current = base.length > 0 ? base[base.length - 1].close : 0;
      dirtyRef.current = false;
      setPrice(priceRef.current);
      setLastUpdate(null);
    }

    if (!provider || !configured) return;
    enqueue(loadOrder(selectedTimeframe, LOAD_PRIORITY));
  }, [instrument.id, provider, configured, selectedTimeframe, enqueue]);

  // ---- Live ticks, when the provider has them -----------------------------
  useEffect(() => {
    if (!provider?.subscribeTicks) {
      setStreamStatus(provider ? 'UNAVAILABLE' : 'OFFLINE');
      return;
    }
    let active = true;
    const subscription = provider.subscribeTicks(instrument, {
      onStatus: status => {
        if (active) setStreamStatus(status);
      },
      onTick: tick => {
        if (!active) return;
        priceRef.current = tick.price;
        dirtyRef.current = true;
      },
      onCandle: (_timeframe, candle) => {
        if (!active) return;
        candlesRef.current = upsertLastCandle(candlesRef.current, candle);
        dirtyRef.current = true;
        setRevision(r => r + 1);
      },
    });
    return () => {
      active = false;
      subscription.close();
    };
  }, [provider, instrument]);

  // ---- Coalesced commit of everything accumulated since the last flush ----
  useEffect(() => {
    const interval = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const series = candlesRef.current;
      setPrice(priceRef.current);
      setLastUpdate(Date.now());

      // Advance the mergeable higher timeframes from the live base tail so they
      // move with the market instead of freezing at the last fetch.
      setCached(prev => {
        const next = { ...prev };
        for (const timeframe of MERGEABLE_TIMEFRAMES) {
          const entry = prev[timeframe];
          if (!entry) continue;
          next[timeframe] = { ...entry, series: mergeLiveTail(entry.series, series, TIMEFRAME_MINUTES[timeframe]) };
        }
        cacheRef.current = next;
        return next;
      });
    }, FLUSH_MS);
    return () => clearInterval(interval);
  }, []);

  // ---- Auto-refresh: ONLY expired timeframes of the selected asset --------
  // One request at a time, never when the server meter has one credit or fewer
  // left, so a user action always has a credit to spend.
  useEffect(() => {
    if (!provider || !configured) return;
    const tick = () => {
      const now = Date.now();
      if (rateLimitedUntilRef.current !== null && rateLimitedUntilRef.current > now) return;

      const serverCredit = futuresCreditState();
      if (serverCredit && serverCredit.remaining <= REFRESH_CREDIT_RESERVE) {
        // Leave the reserve for a user action; the next tick will reconsider.
        return;
      }

      // Only timeframes that ALREADY have data are refreshed. A never-loaded
      // timeframe is not "expired", it is unfilled: re-queueing it here is what
      // would turn a symbol/plan error into a retry loop.
      const loaded = TIMEFRAMES.filter(tf => statusesRef.current[tf]?.state === 'READY');
      const expired = expiredTimeframes(cacheRef.current, loaded, DEFAULT_COMPASS_CONFIG.timeframeTtlMs, now, CLIENT_TTL_SAFETY_MS);
      if (expired.length > 0) enqueue(expired);
    };
    const interval = setInterval(tick, 15_000);
    return () => clearInterval(interval);
  }, [provider, configured, enqueue]);

  // ---- Derived state ------------------------------------------------------
  const sourceLabel = provider ? provider.label : 'No provider';
  const resolvedSource = resolvedSourceFor(instrument.id) ?? null;

  const seriesByTimeframe = useMemo(() => {
    const out: Partial<Record<Timeframe, Candle[]>> = {};
    for (const timeframe of TIMEFRAMES) {
      const entry = cached[timeframe];
      if (entry) out[timeframe] = entry.series;
    }
    return out;
  }, [cached]);

  const candles = useMemo(() => seriesByTimeframe[BASE_TIMEFRAME] ?? [], [seriesByTimeframe]);

  const fetchedAtByTimeframe = useMemo(() => {
    const out: Partial<Record<Timeframe, number>> = {};
    for (const timeframe of TIMEFRAMES) {
      const entry = cached[timeframe];
      if (entry) out[timeframe] = entry.fetchedAt;
    }
    return out;
  }, [cached]);

  const feedMode: 'STREAM' | 'POLL' | 'NONE' = useMemo(() => {
    if (!provider) return 'NONE';
    if (streamStatus === 'CONNECTING' || streamStatus === 'LIVE' || streamStatus === 'RECONNECTING') {
      return 'STREAM';
    }
    if (candles.length > 0) return 'POLL';
    return 'NONE';
  }, [provider, streamStatus, candles.length]);

  const market = useMemo(
    () => marketState(candles, BASE_TIMEFRAME, lastUpdate ?? Date.now()),
    [candles, lastUpdate]
  );

  const effectiveStatus: StreamStatus = useMemo(() => {
    if (!provider) return 'OFFLINE';
    if (rateLimitedUntil !== null) return 'RATE_LIMITED';
    if (streamStatus === 'UNAVAILABLE' || streamStatus === 'RATE_LIMITED') return 'UNAVAILABLE';
    if (provider.capabilities.ticks) return streamStatus;
    return candles.length > 0 ? 'LIVE' : streamStatus;
  }, [provider, streamStatus, candles.length, rateLimitedUntil]);

  const stale = rateLimitedUntil !== null;

  // A load is "in progress" while any timeframe is still to arrive: idle (queued),
  // loading, or waiting for the meter to reset. Derived from the status map so it
  // is reactive rather than read out of a ref during render.
  const isLoading = useMemo(
    () =>
      TIMEFRAMES.some(tf => {
        const state = statuses[tf]?.state;
        return state === 'IDLE' || state === 'LOADING' || state === 'WAITING_FOR_CREDITS';
      }),
    [statuses]
  );

  const loadedTimeframes = useMemo(
    () => TIMEFRAMES.filter(tf => cached[tf] && statuses[tf]?.state === 'READY'),
    [cached, statuses]
  );
  const waitingTimeframes = useMemo(
    () => TIMEFRAMES.filter(tf => statuses[tf]?.state === 'WAITING_FOR_CREDITS'),
    [statuses]
  );

  const serverCredit = futuresCreditState();

  return useMemo(
    () => ({
      instrument,
      candles,
      seriesByTimeframe,
      price,
      lastUpdate,
      streamStatus: effectiveStatus,
      isLoading,
      error,
      configured,
      sourceReachable,
      unavailableReason,
      sourceLabel,
      resolvedSource,
      feedMode,
      market,
      revision,
      timeframeStatus: statuses,
      loadingTimeframes,
      loadedTimeframes,
      waitingTimeframes,
      fetchedAtByTimeframe,
      stale,
      rateLimitedUntil:
        rateLimitedUntil ?? (serverCredit?.exhausted ? serverCredit.resetAt : null),
    }),
    [
      instrument,
      candles,
      seriesByTimeframe,
      price,
      lastUpdate,
      effectiveStatus,
      isLoading,
      error,
      configured,
      sourceReachable,
      unavailableReason,
      sourceLabel,
      resolvedSource,
      feedMode,
      market,
      revision,
      statuses,
      loadingTimeframes,
      loadedTimeframes,
      waitingTimeframes,
      fetchedAtByTimeframe,
      stale,
      rateLimitedUntil,
      serverCredit?.exhausted,
      serverCredit?.resetAt,
    ]
  );
}

/** True when a timestamp is recent enough to call the feed live. */
export function isFeedFresh(lastUpdate: number | null, now = Date.now()): boolean {
  if (!lastUpdate) return false;
  return now - lastUpdate < LIVE_AGE_MS;
}
