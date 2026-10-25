// ============================================
// INSTRUMENT FEED HOOK
// ============================================
// The single data entry point for one instrument. It talks to whatever
// provider the instrument declares, and it never invents data:
//
//  * candles come from provider.getCandles, or the feed is unavailable
//  * the live price comes from provider.subscribeTicks when the provider has a
//    tick feed, otherwise it is the last candle close with the fetch time
//  * order flow comes from provider.subscribeOrderFlow only when the provider
//    genuinely has it; otherwise orderFlow.available is false and the UI hides
//    the panel instead of estimating flow from candles
//
// Candle history is cached per instrument so switching instruments and back
// does not refetch, and live ticks patch the last candle rather than
// recomputing the whole series.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../core/types';
import type { Instrument } from '../core/instruments';
import {
  ProviderError,
  providerForInstrument,
  probeFuturesProvider,
  type OrderFlowSnapshot,
  type ProviderErrorKind,
  type StreamStatus,
} from '../core/providers';
import { mergeLiveTail, upsertLastCandle } from '../core/candles';
import { TIMEFRAMES, TIMEFRAME_MINUTES } from '../core/types';
import {
  applyTrade,
  buildOrderFlowSnapshot,
  emptyOrderFlowSnapshot,
  emptyOrderFlowState,
  resetOrderFlowState,
  type OrderFlowState,
} from '../core/orderFlow';

/** The base timeframe the live tail is merged from. */
export const BASE_TIMEFRAME: Timeframe = '1m';
export const BASE_INTERVAL_MINUTES = 1;
const BASE_CANDLE_LIMIT = 1000;
/** Higher timeframes are fetched natively, so 300 bars already covers years. */
const TIMEFRAME_CANDLE_LIMIT = 300;
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

export interface FeedError {
  kind: ProviderErrorKind;
  message: string;
}

export interface InstrumentFeed {
  instrument: Instrument;
  /** Base-timeframe series, patched live from ticks. */
  candles: Candle[];
  /**
   * Every timeframe the provider could serve natively. The higher timeframes
   * are fetched as their own intervals rather than aggregated from the base
   * series, so a 5m seed cannot cap how far back the weekly reaches.
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
  /** Why it is unavailable, when it is. */
  unavailableReason: string | null;
  /** Human label of the source actually serving this instrument. */
  sourceLabel: string;
  orderFlow: OrderFlowSnapshot;
  /** True only when the provider reports genuine order flow. */
  orderFlowAvailable: boolean;
  /** Bumped whenever the candle series changes, for downstream memo keys. */
  revision: number;
}

function emptyOrderFlow(): OrderFlowSnapshot {
  return emptyOrderFlowSnapshot();
}

function toFeedError(error: unknown): FeedError {
  if (error instanceof ProviderError) return { kind: error.kind, message: error.message };
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'UNKNOWN', message: 'Request cancelled' };
  }
  return { kind: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown error' };
}

/** Cumulative delta from the real per-candle aggressor split, when present. */
export { cumulativeDeltaFromCandles } from '../core/orderFlow';

/**
 * Candle cache shared across hook instances. Keyed by instrument id, so a
 * symbol switch reuses the series it already fetched.
 */
const candleCache = new Map<string, { seriesByTimeframe: Partial<Record<Timeframe, Candle[]>>; fetchedAt: number }>();

export function clearCandleCache(): void {
  candleCache.clear();
}

export function useInstrumentFeed(instrument: Instrument): InstrumentFeed {
  const provider = providerForInstrument(instrument);

  const [candles, setCandles] = useState<Candle[]>(() => candleCache.get(instrument.id)?.seriesByTimeframe[BASE_TIMEFRAME] ?? []);
  const [seriesByTimeframe, setSeriesByTimeframe] = useState<Partial<Record<Timeframe, Candle[]>>>(
    () => candleCache.get(instrument.id)?.seriesByTimeframe ?? {}
  );
  const [price, setPrice] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('CONNECTING');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FeedError | null>(null);
  const [configured, setConfigured] = useState<boolean>(provider ? provider.isConfigured() : false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [orderFlow, setOrderFlow] = useState<OrderFlowSnapshot>(emptyOrderFlow);
  const [revision, setRevision] = useState(0);

  const candlesRef = useRef<Candle[]>(candles);
  const priceRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const flowStateRef = useRef<OrderFlowState>(emptyOrderFlowState());
  const streamStatusRef = useRef<StreamStatus>('CONNECTING');
  const activeInstrumentRef = useRef(instrument.id);
  const mergeableRef = useRef<Timeframe[]>(MERGEABLE_TIMEFRAMES);

  // Mirror the status into a ref so the flush interval reads the current value
  // without being recreated on every status change.
  useEffect(() => {
    streamStatusRef.current = streamStatus;
  }, [streamStatus]);

  // Futures configuration is a server-side fact; ask the status route first.
  useEffect(() => {
    if (!provider || provider.capabilities.ticks || provider.capabilities.orderFlow) {
      setConfigured(provider ? provider.isConfigured() : false);
      setUnavailableReason(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    probeFuturesProvider(controller.signal)
      .then(result => {
        if (!active) return;
        setConfigured(result.configured);
        setUnavailableReason(result.configured ? null : result.note ?? null);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(false);
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
    flowStateRef.current = resetOrderFlowState();
    dirtyRef.current = false;

    setCandles(cachedBase);
    setSeriesByTimeframe(cached?.seriesByTimeframe ?? {});
    setPrice(priceRef.current);
    setOrderFlow(emptyOrderFlow());
    setError(null);
    setLastUpdate(cached ? cached.fetchedAt : null);
    setIsLoading(true);
  }, [instrument.id]);

  // Fetch every timeframe natively. The base series is seeded first so the
  // page can render as soon as it lands; the higher timeframes fill in after.
  useEffect(() => {
    if (!provider) {
      setError({ kind: 'NOT_CONFIGURED', message: `No provider registered for ${instrument.id}` });
      setIsLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      const collected: Partial<Record<Timeframe, Candle[]>> = {};
      let failed = false;

      // Base first, then the rest. A failure on one timeframe must not blank
      // the others, so each is caught on its own.
      for (const timeframe of TIMEFRAMES) {
        const limit = timeframe === BASE_TIMEFRAME ? BASE_CANDLE_LIMIT : TIMEFRAME_CANDLE_LIMIT;
        try {
          const series = await provider.getCandles(instrument, timeframe, limit, controller.signal);
          if (!active) return;
          collected[timeframe] = series;

          if (timeframe === BASE_TIMEFRAME) {
            candlesRef.current = series;
            if (series.length > 0) priceRef.current = series[series.length - 1].close;
            setCandles(series);
            setPrice(priceRef.current);
            setLastUpdate(Date.now());
            setIsLoading(false);
          }
          setSeriesByTimeframe({ ...collected });
        } catch (err) {
          if (!active) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const feedError = toFeedError(err);
          setError(feedError);
          if (feedError.kind === 'NOT_CONFIGURED') setConfigured(false);
          failed = true;
          break;
        }
      }

      if (!active) return;

      // A failure must survive: overwriting it here would report an instrument
      // with no usable candles as configured and error-free.
      if (failed) {
        setIsLoading(false);
        return;
      }

      candleCache.set(instrument.id, { seriesByTimeframe: collected, fetchedAt: Date.now() });
      setError(null);
      setConfigured(true);
      setUnavailableReason(null);
      setIsLoading(false);
      setRevision(r => r + 1);
    };

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [provider, instrument, configured]);

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

  // Order flow, only when the provider genuinely has it.
  useEffect(() => {
    if (!provider?.subscribeOrderFlow) {
      setOrderFlow(emptyOrderFlow());
      return;
    }

    let active = true;
    const subscription = provider.subscribeOrderFlow(instrument, {
      onStatus: status => {
        if (!active) return;
        // A dropped socket must clear the accumulated tape totals rather than
        // leave a stale split on screen.
        if (status === 'RECONNECTING' || status === 'OFFLINE') {
          flowStateRef.current = resetOrderFlowState();
        }
        setOrderFlow(prev => ({ ...prev, streamStatus: status, isLive: status === 'LIVE' }));
        dirtyRef.current = true;
      },
      onBook: (bids, asks) => {
        if (!active) return;
        flowStateRef.current = { ...flowStateRef.current, bids, asks };
        dirtyRef.current = true;
      },
      onTrade: trade => {
        if (!active) return;
        flowStateRef.current = applyTrade(flowStateRef.current, trade);
        priceRef.current = trade.price;
        dirtyRef.current = true;
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
      setCandles(series);
      setPrice(priceRef.current);
      setLastUpdate(Date.now());

      // Advance the mergeable higher timeframes from the live base tail so
      // they move with the market instead of freezing at the last fetch.
      if (mergeableRef.current.length > 0 && series.length > 0) {
        setSeriesByTimeframe(prev => {
          const next = { ...prev };
          for (const timeframe of mergeableRef.current) {
            const native = prev[timeframe];
            if (!native) continue;
            next[timeframe] = mergeLiveTail(native, series, TIMEFRAME_MINUTES[timeframe]);
          }
          return next;
        });
      }

      if (provider?.capabilities.orderFlow) {
        setOrderFlow(buildOrderFlowSnapshot(flowStateRef.current, series, streamStatusRef.current, Date.now()));
      }
    }, FLUSH_MS);

    return () => clearInterval(interval);
  }, [provider]);

  const sourceLabel = provider ? provider.label : 'No provider';

  const orderFlowAvailable = Boolean(provider?.capabilities.orderFlow);

  // A provider with candles but no tick feed is still live in the sense that
  // its newest bar is current; the status reflects what is actually true.
  const effectiveStatus: StreamStatus = useMemo(() => {
    if (!provider) return 'OFFLINE';
    if (provider.capabilities.ticks || provider.capabilities.orderFlow) return streamStatus;
    return candles.length > 0 ? 'LIVE' : streamStatus;
  }, [provider, streamStatus, candles.length]);

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
      unavailableReason,
      sourceLabel,
      orderFlow: orderFlowAvailable
        ? orderFlow
        : { ...emptyOrderFlow(), streamStatus: effectiveStatus, isLive: effectiveStatus === 'LIVE' },
      orderFlowAvailable,
      revision,
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
      unavailableReason,
      sourceLabel,
      orderFlow,
      orderFlowAvailable,
      revision,
    ]
  );
}

/** True when a timestamp is recent enough to call the feed live. */
export function isFeedFresh(lastUpdate: number | null, now = Date.now()): boolean {
  if (!lastUpdate) return false;
  return now - lastUpdate < LIVE_AGE_MS;
}
