// ============================================
// INSTRUMENT FEED HOOK
// ============================================
// The single data entry point for one instrument. It talks to whatever provider
// the instrument declares, and it never invents data:
//
//  * candles come from provider.getCandles, or the feed is unavailable
//  * the live price comes from provider.subscribeTicks when the provider has a
//    tick feed, otherwise it is polled through the live-quote provider
//
// MULTI-TIMEFRAME, ONE ASSET. Selecting an asset queues ALL seven timeframes —
// the selected one first so the compasses and the table fill immediately, then
// the rest highest-first — and the queue runs one request at a time, staggered so
// it stays inside the per-minute credit budget. The user never has to click each
// timeframe.
//
// INDEPENDENT STATE. Every (asset, timeframe) keeps its own data, status, error
// and last-update time. A failure or a rate limit on one timeframe never blanks,
// overwrites or blocks another: a blocked request pauses only the queue, and the
// timeframes already loaded stay on screen untouched.
//
// A rate limit is a first-class state, not an error string. It marks the affected
// timeframes "waiting" and pauses the queue until the credit window the server
// reported; on resume only the waiting timeframes are retried. A failure that is
// NOT a rate limit is never retried in a loop.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../core/types';
import { TIMEFRAMES } from '../core/types';
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
import { activeLiveQuoteProvider, setLivePollIntervalMs } from '../core/providers/live';
import { mergeLiveTail, upsertLastCandle } from '../core/candles';
import { TIMEFRAME_MINUTES } from '../core/types';
import { marketState, type MarketStateResult } from '../core/marketHours';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';
import { DEFAULT_CREDITS_PER_MINUTE, queueStaggerMs } from '../config/credits';
import { pollIntervalFor } from '../core/providers/polling';
import { loadOrder, type LoadStatus } from '../core/timeframeQueue';

/** The base timeframe the live tail is merged from. */
export const BASE_TIMEFRAME: Timeframe = '1m';
export const BASE_INTERVAL_MINUTES = 1;
const BASE_CANDLE_LIMIT = 1000;
/**
 * Candles requested per timeframe. At least 250 so EMA 200 is valid; a single
 * request per timeframe, so the wider window costs the same one credit.
 */
const TIMEFRAME_CANDLE_LIMIT = Math.max(250, DEFAULT_COMPASS_CONFIG.requestedCandles);
/**
 * Timeframes whose bucket boundary lines up with the base series, so their
 * newest bar can be rebuilt from the live base tail. Weekly is excluded: its
 * exchange boundary (Monday open) is not the epoch-based bucket. A daily bucket
 * is only merged when the base window actually reaches its open — see
 * mergeLiveTail, which refuses a partial rebuild.
 */
const MERGEABLE_TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1h', '4h', '1D'];
/** The stream pushes far faster than a screen needs to repaint. */
const FLUSH_MS = 200;
/** A tick this old is reported as delayed rather than live. */
const LIVE_AGE_MS = 8_000;
/** A rate limit with no reported reset is retried after this long (ms). */
const RATE_LIMIT_DEFAULT_RETRY_MS = 60_000;

export interface FeedError {
  kind: ProviderErrorKind;
  message: string;
}

/** The independent state of one (asset, timeframe). */
export interface TimeframeLoadState {
  status: LoadStatus;
  error: FeedError | null;
  /** Epoch ms the series was last fetched for this timeframe. */
  updatedAt: number | null;
}

export interface InstrumentFeed {
  instrument: Instrument;
  /** Base-timeframe series, patched live from ticks. */
  candles: Candle[];
  /**
   * Every timeframe the feed has loaded so far. Each was fetched as its own
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
  /** Bumped whenever the candle series changes, for downstream memo keys. */
  revision: number;
  /** Timeframes with a request in flight, so a per-button state can be drawn. */
  loadingTimeframes: Timeframe[];
  /** Timeframes already fetched this session, keyed by asset + timeframe. */
  loadedTimeframes: Timeframe[];
  /** The independent load state of every timeframe, for the chip row. */
  timeframeStates: Record<Timeframe, TimeframeLoadState>;
  /** Epoch ms of the last live quote, for the data-age display. */
  liveQuoteAt: number | null;
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

/** The idle state every timeframe starts in. */
function idleStates(): Record<Timeframe, TimeframeLoadState> {
  const map = {} as Record<Timeframe, TimeframeLoadState>;
  for (const timeframe of TIMEFRAMES) {
    map[timeframe] = { status: 'idle', error: null, updatedAt: null };
  }
  return map;
}

/**
 * Candle cache shared across hook instances, keyed by instrument id, so a
 * symbol switch reuses what was already fetched.
 */
interface CachedInstrument {
  seriesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  fetchedAtByTimeframe: Partial<Record<Timeframe, number>>;
}

const candleCache = new Map<string, CachedInstrument>();

export function clearCandleCache(): void {
  candleCache.clear();
}

function limitFor(timeframe: Timeframe): number {
  return timeframe === BASE_TIMEFRAME ? BASE_CANDLE_LIMIT : TIMEFRAME_CANDLE_LIMIT;
}

export function useInstrumentFeed(instrument: Instrument, selectedTimeframe: Timeframe): InstrumentFeed {
  const provider = providerForInstrument(instrument);

  const initialCache = candleCache.get(instrument.id);
  const [seriesByTimeframe, setSeriesByTimeframe] = useState<Partial<Record<Timeframe, Candle[]>>>(
    () => initialCache?.seriesByTimeframe ?? {}
  );
  const [timeframeStates, setTimeframeStates] = useState<Record<Timeframe, TimeframeLoadState>>(() => {
    const states = idleStates();
    for (const timeframe of Object.keys(initialCache?.seriesByTimeframe ?? {}) as Timeframe[]) {
      states[timeframe] = {
        status: 'loaded',
        error: null,
        updatedAt: initialCache?.fetchedAtByTimeframe[timeframe] ?? Date.now(),
      };
    }
    return states;
  });
  const [price, setPrice] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [liveQuoteAt, setLiveQuoteAt] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('CONNECTING');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FeedError | null>(null);
  const [configured, setConfigured] = useState<boolean>(provider ? provider.isConfigured() : false);
  const [sourceReachable, setSourceReachable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);

  const candlesRef = useRef<Candle[]>(seriesByTimeframe[BASE_TIMEFRAME] ?? []);
  const priceRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const activeInstrumentRef = useRef(instrument.id);
  // The currently shown timeframe, read by the loader through a ref so that
  // switching timeframe does not rebuild the loader and churn the load effect.
  const selectedTimeframeRef = useRef(selectedTimeframe);
  selectedTimeframeRef.current = selectedTimeframe;
  const seriesRef = useRef(seriesByTimeframe);
  seriesRef.current = seriesByTimeframe;

  // The queue's source of truth, kept in refs so the pump never reads a stale
  // closure. `timeframeStates` mirrors `statusRef` for rendering.
  const statusRef = useRef<Record<Timeframe, TimeframeLoadState>>(timeframeStates);
  const pendingRef = useRef<Timeframe[]>([]);
  const pumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pumpingRef = useRef(false);
  // The per-minute ceiling, learned from the status route, used to stagger the
  // queue. The shipped plan is 8 credits/minute.
  const creditsPerMinuteRef = useRef<number>(DEFAULT_CREDITS_PER_MINUTE);

  const applyState = useCallback((timeframe: Timeframe, next: TimeframeLoadState) => {
    statusRef.current = { ...statusRef.current, [timeframe]: next };
    setTimeframeStates(statusRef.current);
  }, []);

  // Futures configuration is a server-side fact; ask the status route first.
  // The provider caches the answer and shares one in-flight request, so the
  // selector and this hook asking together costs a single call.
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
        if (result.creditsPerMinute && result.creditsPerMinute > 0) {
          creditsPerMinuteRef.current = result.creditsPerMinute;
        }
        setLivePollIntervalMs(result.livePollIntervalMs);
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

  /** Replace the pending queue, dropping duplicates and anything not queueable. */
  const setQueue = useCallback((timeframes: Timeframe[]) => {
    const seen = new Set<Timeframe>();
    pendingRef.current = timeframes.filter(timeframe => {
      if (seen.has(timeframe)) return false;
      seen.add(timeframe);
      const status = statusRef.current[timeframe]?.status ?? 'idle';
      return status === 'idle' || status === 'waiting';
    });
  }, []);

  /** Put one timeframe at the front of the queue when it is not already loaded. */
  const prioritize = useCallback((timeframe: Timeframe) => {
    const status = statusRef.current[timeframe]?.status ?? 'idle';
    if (status !== 'idle' && status !== 'waiting') return;
    pendingRef.current = [timeframe, ...pendingRef.current.filter(entry => entry !== timeframe)];
  }, []);

  /**
   * Force one timeframe to the front of the queue even when it is already loaded,
   * so the auto-refresh can re-fetch it. Only used for the SELECTED timeframe at
   * its plan cadence, so it cannot turn into a sweep.
   */
  const refresh = useCallback((timeframe: Timeframe) => {
    pendingRef.current = [timeframe, ...pendingRef.current.filter(entry => entry !== timeframe)];
  }, []);

  // Fetch one timeframe and record the outcome under its own key. Never touches
  // another timeframe's state.
  const loadTimeframe = useCallback(
    async (timeframe: Timeframe) => {
      if (!provider) return;
      const controller = new AbortController();
      abortRef.current = controller;
      applyState(timeframe, {
        status: 'loading',
        error: statusRef.current[timeframe]?.error ?? null,
        updatedAt: statusRef.current[timeframe]?.updatedAt ?? null,
      });

      try {
        const series = await provider.getCandles(instrument, timeframe, limitFor(timeframe), controller.signal);

        const next = { ...seriesRef.current, [timeframe]: series };
        setSeriesByTimeframe(next);

        // The price is the newest real close we have, whichever timeframe it came
        // from. Nothing is fabricated: an empty series leaves the price alone.
        if (series.length > 0) priceRef.current = series[series.length - 1].close;
        if (timeframe === BASE_TIMEFRAME) candlesRef.current = series;
        setPrice(priceRef.current);
        setLastUpdate(Date.now());
        setConfigured(true);
        setSourceReachable(true);
        setUnavailableReason(null);
        setRevision(r => r + 1);

        const fetchedAt = Date.now();
        applyState(timeframe, { status: 'loaded', error: null, updatedAt: fetchedAt });
        if (timeframe === selectedTimeframeRef.current) setError(null);

        const cached = candleCache.get(instrument.id) ?? { seriesByTimeframe: {}, fetchedAtByTimeframe: {} };
        candleCache.set(instrument.id, {
          seriesByTimeframe: next,
          fetchedAtByTimeframe: { ...cached.fetchedAtByTimeframe, [timeframe]: fetchedAt },
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const feedError = toFeedError(err);
        if (feedError.kind === 'NOT_CONFIGURED') setConfigured(false);

        if (feedError.kind === 'RATE_LIMIT') {
          // Our own state, not the vendor's text. Mark ONLY this timeframe as
          // waiting; everything already loaded stays on screen untouched. The
          // resume effect schedules the retry for the reset the server reported,
          // and only the waiting timeframes are re-queued — never in a loop.
          const retryAfter = err instanceof ProviderError ? err.retryAfterMs : undefined;
          const delay = Math.max(retryAfter ?? 0, RATE_LIMIT_DEFAULT_RETRY_MS);
          const until = Date.now() + delay;
          applyState(timeframe, {
            status: 'waiting',
            error: { kind: 'RATE_LIMIT', message: 'Waiting for credits' },
            updatedAt: statusRef.current[timeframe]?.updatedAt ?? null,
          });
          setRateLimitedUntil(prev => (prev === null || until > prev ? until : prev));
        } else {
          // A permanent failure for this timeframe. It is reported and never
          // retried automatically: a symbol or plan problem does not fix itself.
          applyState(timeframe, {
            status: 'error',
            error: feedError,
            updatedAt: statusRef.current[timeframe]?.updatedAt ?? null,
          });
        }
        if (timeframe === selectedTimeframeRef.current) {
          setError(feedError.kind === 'RATE_LIMIT' ? { kind: 'RATE_LIMIT', message: 'Rate limit reached' } : feedError);
        }
      }
    },
    [instrument, provider, applyState]
  );

  // The pump: one request at a time, then the next after a plan-scaled stagger.
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    if (pendingRef.current.length === 0) {
      setIsLoading(false);
      return;
    }
    pumpingRef.current = true;
    const timeframe = pendingRef.current.shift()!;
    try {
      await loadTimeframe(timeframe);
    } finally {
      pumpingRef.current = false;
      const stillPending = pendingRef.current.length > 0;
      setIsLoading(stillPending);
      if (stillPending) {
        const stagger = queueStaggerMs(creditsPerMinuteRef.current);
        pumpTimerRef.current = setTimeout(() => void pump(), stagger);
      }
    }
  }, [loadTimeframe]);

  // On an asset change, reset from the cache and queue every timeframe. The
  // selected one goes first; the rest follow highest-first.
  useEffect(() => {
    const changed = activeInstrumentRef.current !== instrument.id;
    if (changed) {
      activeInstrumentRef.current = instrument.id;
      if (pumpTimerRef.current) clearTimeout(pumpTimerRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      pumpingRef.current = false;
      pendingRef.current = [];
      abortRef.current?.abort();
      abortRef.current = null;

      const restored = candleCache.get(instrument.id) ?? { seriesByTimeframe: {}, fetchedAtByTimeframe: {} };
      seriesRef.current = restored.seriesByTimeframe;
      setSeriesByTimeframe(restored.seriesByTimeframe);

      const states = idleStates();
      for (const timeframe of Object.keys(restored.seriesByTimeframe) as Timeframe[]) {
        states[timeframe] = {
          status: 'loaded',
          error: null,
          updatedAt: restored.fetchedAtByTimeframe[timeframe] ?? Date.now(),
        };
      }
      statusRef.current = states;
      setTimeframeStates(states);

      const base = restored.seriesByTimeframe[BASE_TIMEFRAME] ?? [];
      candlesRef.current = base;
      priceRef.current = base.length > 0 ? base[base.length - 1].close : 0;
      dirtyRef.current = false;
      setPrice(priceRef.current);
      setLastUpdate(null);
      setLiveQuoteAt(null);
      setError(null);
      setRateLimitedUntil(null);
      setIsLoading(true);
    }

    if (!provider) {
      setError({ kind: 'NOT_CONFIGURED', message: `No provider registered for ${instrument.id}` });
      setIsLoading(false);
      return;
    }

    setQueue(loadOrder(selectedTimeframe, BASE_TIMEFRAME));
    void pump();
  }, [instrument.id, provider, selectedTimeframe, setQueue, pump]);

  // Selecting a timeframe only changes what is shown. A loaded one needs no
  // request; a not-yet-loaded one is moved to the front of the queue so it
  // arrives next. The compasses and the table switch instantly from memory.
  useEffect(() => {
    if (!provider) return;
    prioritize(selectedTimeframe);
    void pump();
  }, [selectedTimeframe, provider, prioritize, pump]);

  // When the credit window the server reported has passed, retry only the
  // waiting timeframes. A non-rate-limit error is never re-queued.
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const delay = Math.max(0, rateLimitedUntil - Date.now()) + 250;
    resumeTimerRef.current = setTimeout(() => {
      setRateLimitedUntil(null);
      const waiting = TIMEFRAMES.filter(timeframe => statusRef.current[timeframe]?.status === 'waiting');
      if (waiting.length > 0) {
        setQueue([selectedTimeframe, ...waiting]);
        setIsLoading(true);
        void pump();
      }
    }, delay);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [rateLimitedUntil, selectedTimeframe, setQueue, pump]);

  // Auto-refresh: re-fetch the SELECTED timeframe at its plan-scaled cadence so
  // the compasses and the table keep moving without a click. Only one timeframe
  // is refreshed per tick, and a failed or waiting one is left to the queue and
  // the resume effect, so this never fights them or loops on an error.
  useEffect(() => {
    if (!provider) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const schedule = () => {
      if (!active) return;
      const interval = pollIntervalFor(selectedTimeframe, creditsPerMinuteRef.current);
      timer = setTimeout(() => {
        if (!active) return;
        const status = statusRef.current[selectedTimeframe]?.status;
        if (status === 'loaded') {
          refresh(selectedTimeframe);
          void pump();
        }
        schedule();
      }, interval);
    };

    schedule();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [provider, selectedTimeframe, refresh, pump]);

  // Live ticks, when the provider has them. A provider without a tick feed is
  // served by the live-quote poller below instead.
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

  // Near-real-time price, through the live-quote provider (a REST poll today; a
  // streaming adapter can be registered later without touching this hook). It
  // refreshes the Summary price and the M1 reading of the selected asset at the
  // configured cadence, within the credit budget.
  useEffect(() => {
    if (!provider) return;
    const live = activeLiveQuoteProvider();
    if (!live.isConfigured()) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const tick = async () => {
      if (!active) return;
      try {
        const quote = await live.getQuote({ instrumentId: instrument.id, timeframe: BASE_TIMEFRAME, signal: controller.signal });
        if (!active) return;
        if (quote) {
          priceRef.current = quote.price;
          if (quote.candle) {
            candlesRef.current = upsertLastCandle(candlesRef.current, quote.candle);
            setSeriesByTimeframe(prev => {
              const base = prev[BASE_TIMEFRAME];
              if (!base) return prev;
              return { ...prev, [BASE_TIMEFRAME]: upsertLastCandle(base, quote.candle!) };
            });
          }
          setPrice(quote.price);
          setLiveQuoteAt(quote.timestamp);
          setLastUpdate(Date.now());
          setRevision(r => r + 1);
        }
      } catch {
        // A failed poll is not fatal: the next one may succeed, and the last
        // real price stays on screen with its real age.
      }
      if (active) timer = setTimeout(tick, live.intervalMs());
    };

    timer = setTimeout(tick, live.intervalMs());

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [provider, instrument.id]);

  // Coalesced commit of everything accumulated since the last flush.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const series = candlesRef.current;
      setPrice(priceRef.current);
      setLastUpdate(Date.now());

      // Advance the mergeable higher timeframes from the live base tail so
      // they move with the market instead of freezing at the last fetch.
      setSeriesByTimeframe(prev => {
        const next = { ...prev };
        for (const timeframe of MERGEABLE_TIMEFRAMES) {
          const native = prev[timeframe];
          if (!native) continue;
          next[timeframe] = mergeLiveTail(native, series, TIMEFRAME_MINUTES[timeframe]);
        }
        return next;
      });
    }, FLUSH_MS);

    return () => clearInterval(interval);
  }, [provider]);

  const sourceLabel = provider ? provider.label : 'No provider';

  // What the server actually resolved for this instrument, for the provenance
  // label. Read on each render so it reflects the last candles response.
  const resolvedSource = resolvedSourceFor(instrument.id) ?? null;

  const candles = useMemo(() => seriesByTimeframe[BASE_TIMEFRAME] ?? [], [seriesByTimeframe]);

  // What the price feed actually is, read from the live status rather than from
  // the provider's static capability: the provider advertises a tick feed but
  // falls back to REST polling when the server has no browser-safe stream, and a
  // polled price is delayed, not live.
  const feedMode: 'STREAM' | 'POLL' | 'NONE' = useMemo(() => {
    if (!provider) return 'NONE';
    if (streamStatus === 'CONNECTING' || streamStatus === 'LIVE' || streamStatus === 'RECONNECTING') {
      return 'STREAM';
    }
    if (candles.length > 0) return 'POLL';
    return 'NONE';
  }, [provider, streamStatus, candles.length]);

  // Whether the market is still producing bars. A closed market must not keep
  // presenting a stale reading as if it were live.
  const market = useMemo(
    () => marketState(candles, BASE_TIMEFRAME, lastUpdate ?? Date.now()),
    [candles, lastUpdate]
  );

  // A provider with candles but no tick feed is still live in the sense that
  // its newest bar is current; the status reflects what is actually true.
  const effectiveStatus: StreamStatus = useMemo(() => {
    if (!provider) return 'OFFLINE';
    if (rateLimitedUntil !== null) return 'RATE_LIMITED';
    if (streamStatus === 'UNAVAILABLE' || streamStatus === 'RATE_LIMITED') return 'UNAVAILABLE';
    if (provider.capabilities.ticks) return streamStatus;
    return candles.length > 0 ? 'LIVE' : streamStatus;
  }, [provider, streamStatus, candles.length, rateLimitedUntil]);

  const stale = rateLimitedUntil !== null || (error?.kind === 'RATE_LIMIT' && candles.length > 0);

  // Server-reported meter state, so a cold start with an exhausted meter is
  // visible before the first candles request lands.
  const serverCredit = futuresCreditState();

  const loadingTimeframes = useMemo(
    () => TIMEFRAMES.filter(timeframe => timeframeStates[timeframe].status === 'loading'),
    [timeframeStates]
  );
  const loadedTimeframes = useMemo(
    () => TIMEFRAMES.filter(timeframe => timeframeStates[timeframe].status === 'loaded'),
    [timeframeStates]
  );

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
      loadingTimeframes,
      loadedTimeframes,
      timeframeStates,
      liveQuoteAt,
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
      loadingTimeframes,
      loadedTimeframes,
      timeframeStates,
      liveQuoteAt,
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
