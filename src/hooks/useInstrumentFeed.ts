// ============================================
// INSTRUMENT FEED HOOK
// ============================================
// The single data entry point for one instrument. It talks to whatever
// provider the instrument declares, and it never invents data:
//
//  * candles come from provider.getCandles, or the feed is unavailable
//  * the live price comes from provider.subscribeTicks when the provider has a
//    tick feed, otherwise it is the last candle close with the fetch time
//
// CREDIT MINIMISATION. The feed loads ONE timeframe — the one the user is
// looking at — not every timeframe the UI can render. Loading all eight on mount
// cost eight vendor credits per page, which alone can spend a whole minute on a
// small plan. Switching timeframe fetches the new one on demand and keeps what it
// already has; switching back is instant and costs nothing.
//
// A rate limit is a first-class state, not an error string. The hook shows our
// own "retrying in Xs" countdown with the last cached series marked stale, and
// retries exactly once after the reset — never in a loop.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../core/types';
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
import { TIMEFRAME_MINUTES } from '../core/types';
import { marketState, type MarketStateResult } from '../core/marketHours';
import { DEFAULT_COMPASS_CONFIG } from '../config/compass';

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

export interface InstrumentFeed {
  instrument: Instrument;
  /** Base-timeframe series, patched live from ticks. */
  candles: Candle[];
  /**
   * Every timeframe the feed has loaded so far. The higher timeframes are
   * fetched as their own intervals when the user selects them, so a 5m seed
   * cannot cap how far back the weekly reaches.
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
  /** Timeframes with a request in flight, so the buttons can be disabled. */
  loadingTimeframes: Timeframe[];
  /** Timeframes already fetched this session, keyed by asset + timeframe. */
  loadedTimeframes: Timeframe[];
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

/**
 * Candle cache shared across hook instances. Keyed by instrument id, so a
 * symbol switch reuses the series it already fetched.
 */
const candleCache = new Map<string, { seriesByTimeframe: Partial<Record<Timeframe, Candle[]>>; fetchedAt: number }>();

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
  const [price, setPrice] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('CONNECTING');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FeedError | null>(null);
  const [configured, setConfigured] = useState<boolean>(provider ? provider.isConfigured() : false);
  const [sourceReachable, setSourceReachable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  // Which timeframes are in flight right now, so the buttons can be disabled
  // while a request is pending.
  const [loadingTimeframes, setLoadingTimeframes] = useState<Timeframe[]>([]);

  const candlesRef = useRef<Candle[]>(seriesByTimeframe[BASE_TIMEFRAME] ?? []);
  const priceRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const activeInstrumentRef = useRef(instrument.id);
  const seriesRef = useRef(seriesByTimeframe);
  seriesRef.current = seriesByTimeframe;

  // Timeframes already fetched (or in flight), so selecting one twice is free.
  const loadedRef = useRef<Set<Timeframe>>(new Set(Object.keys(seriesByTimeframe) as Timeframe[]));
  const inflightRef = useRef<Set<Timeframe>>(new Set());
  const controllerRef = useRef<AbortController | null>(null);

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

  // Reset when the instrument changes. The cache is consulted first so a
  // switch back is instant.
  useEffect(() => {
    if (activeInstrumentRef.current === instrument.id) return;
    activeInstrumentRef.current = instrument.id;

    const cached = candleCache.get(instrument.id);
    const cachedBase = cached?.seriesByTimeframe[BASE_TIMEFRAME] ?? [];
    candlesRef.current = cachedBase;
    priceRef.current = cachedBase.length > 0 ? cachedBase[cachedBase.length - 1].close : 0;
    dirtyRef.current = false;
    loadedRef.current = new Set(Object.keys(cached?.seriesByTimeframe ?? {}) as Timeframe[]);
    inflightRef.current.clear();
    setLoadingTimeframes([]);

    setSeriesByTimeframe(cached?.seriesByTimeframe ?? {});
    setPrice(priceRef.current);
    setError(null);
    setRateLimitedUntil(null);
    setLastUpdate(cached ? cached.fetchedAt : null);
    setIsLoading(true);
  }, [instrument.id]);

  // Fetch one timeframe. On success the series is merged into state and cached;
  // on a rate limit the hook switches to its own countdown state and schedules a
  // single retry after the reset.
  const loadTimeframe = useCallback(
    async (timeframe: Timeframe) => {
      if (!provider) return;
      if (loadedRef.current.has(timeframe)) {
        // Already in memory: no vendor call, and not loading.
        setIsLoading(false);
        return;
      }
      if (inflightRef.current.has(timeframe)) return;

      inflightRef.current.add(timeframe);
      setLoadingTimeframes([...inflightRef.current]);
      const controller = controllerRef.current ?? new AbortController();
      controllerRef.current = controller;

      try {
        const series = await provider.getCandles(instrument, timeframe, limitFor(timeframe), controller.signal);
        loadedRef.current.add(timeframe);

        const next = { ...seriesRef.current, [timeframe]: series };
        setSeriesByTimeframe(next);

        // The price is the newest real close we have, whichever timeframe it came
        // from. Nothing is fabricated: an empty series leaves the price alone.
        if (series.length > 0) priceRef.current = series[series.length - 1].close;
        if (timeframe === BASE_TIMEFRAME) candlesRef.current = series;
        setPrice(priceRef.current);
        setLastUpdate(Date.now());
        setError(null);
        setConfigured(true);
        setSourceReachable(true);
        setUnavailableReason(null);
        setRevision(r => r + 1);
        candleCache.set(instrument.id, { seriesByTimeframe: next, fetchedAt: Date.now() });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const feedError = toFeedError(err);
        if (feedError.kind === 'NOT_CONFIGURED') setConfigured(false);

        if (feedError.kind === 'RATE_LIMIT') {
          // Our own state, not the vendor's text. The last good series stays on
          // screen marked stale; the countdown effect below schedules the single
          // retry for the reset. Nothing here retries in a loop.
          const retryAfter = err instanceof ProviderError ? err.retryAfterMs : undefined;
          const delay = Math.max(retryAfter ?? 0, RATE_LIMIT_DEFAULT_RETRY_MS);
          setRateLimitedUntil(Date.now() + delay);
          setError({ kind: 'RATE_LIMIT', message: 'Rate limit reached' });
        } else {
          setError(feedError);
        }
      } finally {
        inflightRef.current.delete(timeframe);
        setLoadingTimeframes([...inflightRef.current]);
        setIsLoading(false);
      }
    },
    [instrument, provider]
  );

  // Load the selected timeframe. Keyed on the timeframe so selecting a new one
  // fetches exactly that one; a timeframe already loaded is served from memory.
  useEffect(() => {
    if (!provider) {
      setError({ kind: 'NOT_CONFIGURED', message: `No provider registered for ${instrument.id}` });
      setIsLoading(false);
      return;
    }
    void loadTimeframe(selectedTimeframe);
  }, [instrument.id, provider, selectedTimeframe, loadTimeframe]);

  // A fresh window after the reset: retry the selected timeframe once, then let
  // the countdown clear itself. This is the only retry; nothing loops.
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const delay = Math.max(0, rateLimitedUntil - Date.now()) + 250;
    const timer = window.setTimeout(() => {
      setRateLimitedUntil(null);
      loadedRef.current.delete(selectedTimeframe);
      void loadTimeframe(selectedTimeframe);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [rateLimitedUntil, selectedTimeframe, loadTimeframe]);

  // Live ticks, when the provider has them. A provider without a tick feed
  // simply leaves the price at the last candle close.
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
      loadedTimeframes: Object.keys(seriesByTimeframe) as Timeframe[],
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
