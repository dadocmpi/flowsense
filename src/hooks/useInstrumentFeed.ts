// ============================================
// INSTRUMENT FEED HOOK
// ============================================
// A per-instrument VIEW over the market data store. It talks to whatever provider
// the instrument declares and never invents data:
//
//  * candles come from the store, which is filled by the full load on open
//  * the live price comes from the base (1m) series, patched by the provider poll
//
// LOADING. The store loads EVERY asset and EVERY timeframe once, on open. This
// hook does not fetch per selection: it selects the instrument's series out of
// the store, so switching asset or timeframe is instant and costs nothing. Each
// (asset, timeframe) has its own state, so one failed load never blocks another.
//
// A rate limit is a first-class state, not an error string. The store surfaces it
// with the last real series kept and marked stale, and the store's queue retries
// exactly once per reported reset — never in a loop.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Candle, Timeframe } from '../core/types';
import { TIMEFRAMES } from '../core/types';
import type { Instrument, ResolvedSource } from '../core/instruments';
import {
  futuresCreditState,
  creditStateFor,
  providerForResolved,
  providerForInstrument,
  providerConfiguredState,
  probeFuturesProvider,
  resolvedSourceFor,
  type CreditState,
  type ProviderErrorKind,
  type StreamStatus,
} from '../core/providers';
import { mergeLiveTail, upsertLastCandle } from '../core/candles';
import { TIMEFRAME_MINUTES } from '../core/types';
import { marketStateFor, type MarketStateResult } from '../core/marketSessions';
import {
  ensureFullLoad,
  getEntry,
  getSeries,
  getVersion,
  loadedTimeframes as storeLoadedTimeframes,
  seriesByTimeframe as storeSeriesByTimeframe,
  setSeries,
  subscribe,
  type SeriesEntry,
  type StoreError,
} from './marketDataStore';

/** The base timeframe the live tail is merged from. */
export const BASE_TIMEFRAME: Timeframe = '1m';
export const BASE_INTERVAL_MINUTES = 1;
/** Timeframes whose newest bar can be rebuilt from the live base tail. */
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
  /** Every timeframe the store has a series for. */
  seriesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  price: number;
  /** Epoch ms of the newest price or candle update. */
  lastUpdate: number | null;
  streamStatus: StreamStatus;
  isLoading: boolean;
  error: FeedError | null;
  /** True when the instrument has a configured data source. */
  configured: boolean;
  sourceReachable: boolean;
  unavailableReason: string | null;
  sourceLabel: string;
  resolvedSource: ResolvedSource | null;
  /** Which provider is really serving this instrument. */
  providerId: 'twelvedata' | 'alpaca';
  feedMode: 'STREAM' | 'POLL' | 'NONE';
  market: MarketStateResult;
  revision: number;
  loadingTimeframes: Timeframe[];
  loadedTimeframes: Timeframe[];
  stale: boolean;
  rateLimitedUntil: number | null;
  /** Per-timeframe load state for the store-backed series. */
  timeframeState: Partial<Record<Timeframe, SeriesEntry>>;
  /** Per-timeframe market state, so the Entry check can mark closed ones. */
  timeframeMarket: Partial<Record<Timeframe, MarketStateResult>>;
}

function toFeedError(error: StoreError): FeedError {
  return { kind: error.kind, message: error.message };
}

/** The timeframes still loading for an asset, from the store. */
function loadingTimeframesFor(instrumentId: string): Timeframe[] {
  return TIMEFRAMES.filter(timeframe => getEntry(instrumentId, timeframe)?.state === 'loading');
}

export function useInstrumentFeed(instrument: Instrument, selectedTimeframe: Timeframe): InstrumentFeed {
  const provider = providerForInstrument(instrument);
  // Kick off the one full load. Idempotent, so several mounts cost one load.
  ensureFullLoad();

  // Re-render whenever the store changes.
  const storeVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  const [streamStatus, setStreamStatus] = useState<StreamStatus>('UNAVAILABLE');
  const [configured, setConfigured] = useState<boolean>(provider ? provider.isConfigured() : false);
  const [sourceReachable, setSourceReachable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [tickPrice, setTickPrice] = useState<number | null>(null);
  const [tickAt, setTickAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  // A coarse wall clock, so a market that closes while the page is open is
  // re-evaluated and labelled "Market closed" without a new fetch. It is not the
  // live bar time — the bar time is the candle's own timestamp.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const candlesRef = useRef<Candle[]>([]);
  const dirtyRef = useRef(false);

  // Provider configuration is a server-side fact; ask the status route first.
  // The provider caches the answer and shares one in-flight request, so the
  // selector and this hook asking together cost a single call.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    probeFuturesProvider(controller.signal)
      .then(result => {
        if (!active) return;
        // Whether THIS asset's provider is configured is the fact that matters;
        // another provider being configured must not make this asset look ready.
        const perProvider = providerConfiguredState();
        const assetConfigured = perProvider ? perProvider[instrument.providerId] : result.configured;
        setConfigured(assetConfigured);
        setSourceReachable(result.reachable);
        setUnavailableReason(assetConfigured ? null : result.note ?? null);
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
  }, [instrument.providerId]);

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
        setTickPrice(tick.price);
        setTickAt(Date.now());
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

  // Keep the base series ref in sync with the store.
  const storeBase = useMemo(
    () => getSeries(instrument.id, BASE_TIMEFRAME) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instrument.id, storeVersion]
  );
  useEffect(() => {
    candlesRef.current = storeBase;
  }, [storeBase]);

  // Coalesced commit of everything accumulated since the last flush.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setRevision(r => r + 1);
      // Advance the mergeable higher timeframes from the live base tail so they
      // move with the market instead of freezing at the last fetch.
      const base = candlesRef.current;
      for (const timeframe of MERGEABLE_TIMEFRAMES) {
        const native = getSeries(instrument.id, timeframe);
        if (!native) continue;
        const merged = mergeLiveTail(native, base, TIMEFRAME_MINUTES[timeframe]);
        if (merged !== native) setSeries(instrument.id, timeframe, merged);
      }
    }, FLUSH_MS);
    return () => clearInterval(interval);
  }, [instrument.id]);

  const sourceLabel = provider ? provider.label : 'No provider';

  const resolvedSource = resolvedSourceFor(instrument.id) ?? null;
  const providerId: 'twelvedata' | 'alpaca' =
    providerForResolved(instrument.id) ?? (instrument.providerId === 'alpaca' ? 'alpaca' : 'twelvedata');

  const series = useMemo(
    () => storeSeriesByTimeframe(instrument.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instrument.id, storeVersion]
  );

  const candles = useMemo(() => series[BASE_TIMEFRAME] ?? [], [series]);
  const loaded = useMemo(
    () => storeLoadedTimeframes(instrument.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instrument.id, storeVersion]
  );
  const loading = useMemo(
    () => loadingTimeframesFor(instrument.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instrument.id, storeVersion]
  );

  const timeframeState = useMemo(() => {
    const out: Partial<Record<Timeframe, SeriesEntry>> = {};
    for (const timeframe of TIMEFRAMES) {
      const entry = getEntry(instrument.id, timeframe);
      if (entry) out[timeframe] = entry;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.id, storeVersion]);

  const timeframeMarket = useMemo(() => {
    const out: Partial<Record<Timeframe, MarketStateResult>> = {};
    for (const timeframe of TIMEFRAMES) {
      const seriesForFrame = series[timeframe];
      if (!seriesForFrame || seriesForFrame.length === 0) continue;
      // Judged against the wall clock: a market that closes while the page is
      // open must read CLOSED, not stay OPEN until the next fetch.
      out[timeframe] = marketStateFor(providerId, seriesForFrame, timeframe, clock);
    }
    return out;
  }, [providerId, series, clock]);

  // The error to show: the selected timeframe's error, else the base's.
  const selectedEntry = getEntry(instrument.id, selectedTimeframe);
  const error: FeedError | null = selectedEntry?.error ? toFeedError(selectedEntry.error) : null;

  const isLoading = loading.length > 0 && loaded.length === 0;

  const price = useMemo(() => {
    if (tickPrice !== null && tickPrice > 0) return tickPrice;
    return candles.length > 0 ? candles[candles.length - 1].close : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickPrice, candles]);

  const lastUpdate = useMemo(() => {
    const entry = getEntry(instrument.id, selectedTimeframe);
    const seriesAt = entry?.loadedAt ?? null;
    return tickAt !== null && seriesAt !== null ? Math.max(tickAt, seriesAt) : tickAt ?? seriesAt;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.id, selectedTimeframe, tickAt, storeVersion]);

  const feedMode: 'STREAM' | 'POLL' | 'NONE' = useMemo(() => {
    if (!provider) return 'NONE';
    if (streamStatus === 'CONNECTING' || streamStatus === 'LIVE' || streamStatus === 'RECONNECTING') return 'STREAM';
    if (candles.length > 0) return 'POLL';
    return 'NONE';
  }, [provider, streamStatus, candles.length]);

  const market = useMemo(
    () => marketStateFor(providerId, candles, BASE_TIMEFRAME, clock),
    [providerId, candles, clock]
  );

  // The meter state for whichever provider serves this instrument.
  const serverCredit: CreditState | null = creditStateFor(instrument.id) ?? futuresCreditState();
  const rateLimitedUntil = serverCredit?.exhausted ? serverCredit.resetAt : null;

  const effectiveStatus: StreamStatus = useMemo(() => {
    if (!provider) return 'OFFLINE';
    if (rateLimitedUntil !== null) return 'RATE_LIMITED';
    if (streamStatus === 'UNAVAILABLE' || streamStatus === 'RATE_LIMITED') return 'UNAVAILABLE';
    if (provider.capabilities.ticks) return streamStatus;
    return candles.length > 0 ? 'LIVE' : streamStatus;
  }, [provider, streamStatus, candles.length, rateLimitedUntil]);

  const stale = (error?.kind === 'RATE_LIMIT' && candles.length > 0) || rateLimitedUntil !== null;

  return useMemo(
    () => ({
      instrument,
      candles,
      seriesByTimeframe: series,
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
      providerId,
      feedMode,
      market,
      revision,
      loadingTimeframes: loading,
      loadedTimeframes: loaded,
      stale,
      rateLimitedUntil,
      timeframeState,
      timeframeMarket,
    }),
    [
      instrument,
      candles,
      series,
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
      providerId,
      feedMode,
      market,
      revision,
      loading,
      loaded,
      stale,
      rateLimitedUntil,
      timeframeState,
      timeframeMarket,
    ]
  );
}

/** True when a timestamp is recent enough to call the feed live. */
export function isFeedFresh(lastUpdate: number | null, now = Date.now()): boolean {
  if (!lastUpdate) return false;
  return now - lastUpdate < LIVE_AGE_MS;
}
