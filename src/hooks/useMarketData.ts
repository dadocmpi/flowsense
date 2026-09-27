import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BinanceError,
  fetch24hTicker,
  fetchKlines,
  formatUtc,
  openMarketStream,
  type StreamHandle,
} from '../lib/binanceClient';
import { buildIndicators, buildSummary, deriveRanges } from '../lib/marketAnalysis';
import {
  DataQualityScore,
  MarketDataError,
  MarketDataResult,
  MarketDataState,
  OrderBookLevel,
  OrderFlowState,
  TradeFeedItem,
  findAssetConfig,
  type AssetConfig,
} from '../types/trading';
import type { Candle } from '../lib/indicators';

export const BASE_INTERVAL = '5min';
/** The Binance stream interval that backs the base candle series. */
const STREAM_INTERVAL = '5m';
const BASE_OUTPUT_SIZE = 300;
const MAX_TAPE_ITEMS = 50;
/**
 * The exchange pushes trades far faster than a screen needs to repaint. Stream
 * messages accumulate in refs and one trailing-edge flush commits them to state
 * this often, so the UI still updates several times a second without a full
 * re-render on every single trade.
 */
const STREAM_FLUSH_MS = 150;
/** A feed this quiet is reported as delayed rather than live. */
const LIVE_AGE_MS = 5_000;

function emptyState(symbol: string): MarketDataState {
  const config = findAssetConfig(symbol);
  return {
    symbol: config.symbol,
    name: config.name,
    exchange: config.exchange,
    currency: config.quote,
    precision: config.precision,
    price: 0,
    change: 0,
    percentChange: 0,
    high: 0,
    low: 0,
    open: 0,
    previousClose: 0,
    volume: 0,
    averageVolume: 0,
    datetime: '',
    isMarketOpen: true, // crypto trades continuously
    candles: [],
    oscillators: [],
    movingAverages: [],
    volumeIndicators: [],
    overallSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    oscillatorsSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    maSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    volumeSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    atr: null,
    vwap: null,
    pointOfControl: null,
    session: null,
    previousDay: null,
    weekly: null,
    openingRange: null,
  };
}

function emptyOrderFlow(): OrderFlowState {
  return {
    bids: [],
    asks: [],
    recentTrades: [],
    volumeDelta: 0,
    buyerVolume: 0,
    sellerVolume: 0,
    buyersPercent: 50,
    sellersPercent: 50,
    cumulativeDelta: 0,
    isLive: false,
    streamStatus: 'CONNECTING',
    lastUpdate: 0,
  };
}

function toMarketDataError(error: unknown): MarketDataError {
  if (error instanceof BinanceError) {
    return { kind: error.kind, message: error.message };
  }
  return { kind: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown error' };
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assessQuality(
  data: MarketDataState,
  lastUpdated: number | null,
  streamStatus: OrderFlowState['streamStatus']
): DataQualityScore {
  const age = lastUpdated ? Date.now() - lastUpdated : Number.POSITIVE_INFINITY;
  const streamOpen = streamStatus === 'LIVE';

  const freshness: DataQualityScore['metrics']['freshness'] =
    data.price <= 0
      ? 'DISCONNECTED'
      : streamOpen && age < LIVE_AGE_MS
        ? 'LIVE'
        : streamOpen
          ? 'DELAYED'
          : 'STALE';

  const metrics = {
    priceAvailable: data.price > 0,
    candlesValid: data.candles.length >= 50,
    indicatorsValid: data.oscillators.length >= 2 && data.movingAverages.length >= 3,
    volumeAvailable: data.candles.some(c => c.volume > 0),
    multiTimeframeValid: data.candles.length >= 100,
    lastUpdateTime: lastUpdated ?? 0,
    freshness,
    source: data.price > 0 ? ('BINANCE' as const) : ('UNAVAILABLE' as const),
  };

  let overall = 100;
  if (!metrics.priceAvailable) overall -= 50;
  if (!metrics.candlesValid) overall -= 20;
  if (!metrics.indicatorsValid) overall -= 15;
  if (!metrics.volumeAvailable) overall -= 10;
  if (freshness === 'DELAYED') overall -= 10;
  if (freshness === 'STALE') overall -= 30;
  if (freshness === 'DISCONNECTED') overall -= 40;

  return { overall: Math.max(0, Math.min(100, overall)), metrics };
}

function levelsFrom(raw: unknown): OrderBookLevel[] {
  if (!Array.isArray(raw)) return [];

  const parsed: Array<{ price: number; size: number }> = [];
  let maxSize = 0;

  for (const entry of raw.slice(0, 10)) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const price = num(entry[0], NaN);
    const size = num(entry[1], NaN);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (size > maxSize) maxSize = size;
    parsed.push({ price, size });
  }

  return parsed.map(level => ({
    price: level.price,
    size: level.size,
    total: level.price * level.size,
    percentage: maxSize > 0 ? Math.min(100, (level.size / maxSize) * 100) : 0,
  }));
}

function tradesFrom(raw: unknown): TradeFeedItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const price = num(row.p, NaN);
  const size = num(row.q, NaN);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;

  const eventTime = num(row.T, Date.now());
  const d = new Date(eventTime);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`;

  // Binance `m` = "buyer is the maker", so true means the seller aggressed.
  const buyerIsMaker = Boolean(row.m);

  return {
    id: String(row.a ?? eventTime),
    price,
    size,
    time,
    type: buyerIsMaker ? 'SELL' : 'BUY',
    quoteValue: price * size,
  };
}

/** One Binance kline event (`e: "kline"`) as a candle, including the real
 *  taker-buy base volume that keeps the aggressor split intact. */
function candleFromKline(payload: Record<string, unknown>): Candle | null {
  const k = payload.k;
  if (typeof k !== 'object' || k === null) return null;
  const row = k as Record<string, unknown>;

  const openTime = num(row.t, NaN);
  if (!Number.isFinite(openTime)) return null;

  const volume = num(row.v, 0);
  const takerBuyVolume = num(row.V, 0);

  return {
    datetime: formatUtc(openTime),
    open: num(row.o),
    high: num(row.h),
    low: num(row.l),
    close: num(row.c),
    volume,
    takerBuyVolume: Math.min(takerBuyVolume, volume),
  };
}

interface CandleDerived {
  candles: Candle[];
  oscillators: MarketDataState['oscillators'];
  movingAverages: MarketDataState['movingAverages'];
  volumeIndicators: MarketDataState['volumeIndicators'];
  overallSummary: MarketDataState['overallSummary'];
  oscillatorsSummary: MarketDataState['oscillatorsSummary'];
  maSummary: MarketDataState['maSummary'];
  volumeSummary: MarketDataState['volumeSummary'];
  atr: number | null;
  vwap: number | null;
  pointOfControl: number | null;
  session: MarketDataState['session'];
  previousDay: MarketDataState['previousDay'];
  weekly: MarketDataState['weekly'];
  openingRange: MarketDataState['openingRange'];
  averageVolume: number;
  datetime: string;
  cumulativeDelta: number;
}

function deriveCandles(candles: Candle[], precision: number): CandleDerived {
  const indicators = buildIndicators(candles, precision);
  const ranges = deriveRanges(candles);

  const withSplit = candles.filter(c => c.takerBuyVolume !== undefined);
  let cumulativeDelta = 0;
  if (withSplit.length > 0) {
    const windowBuy = withSplit.reduce((acc, c) => acc + (c.takerBuyVolume ?? 0), 0);
    const windowTotal = withSplit.reduce((acc, c) => acc + c.volume, 0);
    cumulativeDelta = windowBuy - Math.max(0, windowTotal - windowBuy);
  }

  return {
    candles,
    oscillators: indicators.oscillators,
    movingAverages: indicators.movingAverages,
    volumeIndicators: indicators.volumeIndicators,
    overallSummary: buildSummary([
      ...indicators.oscillators,
      ...indicators.movingAverages,
      ...indicators.volumeIndicators,
    ]),
    oscillatorsSummary: buildSummary(indicators.oscillators),
    maSummary: buildSummary(indicators.movingAverages),
    volumeSummary: buildSummary(indicators.volumeIndicators),
    atr: indicators.atr,
    vwap: indicators.vwap,
    pointOfControl: indicators.pointOfControl,
    session: ranges.session,
    previousDay: ranges.previousDay,
    weekly: ranges.weekly,
    openingRange: ranges.openingRange,
    averageVolume: candles.slice(-20).reduce((acc, c) => acc + c.volume, 0) / Math.min(20, candles.length),
    datetime: candles[candles.length - 1]?.datetime ?? '',
    cumulativeDelta,
  };
}

/**
 * Loads real market data from Binance's public API over one persistent stream.
 *
 * A single REST call seeds the candle history and the 24h statistics. From then
 * on the public WebSocket carries everything live: the kline stream advances the
 * open candle on every trade (so indicators recompute continuously rather than
 * once a minute), the ticker stream keeps the 24h stats fresh, and the depth and
 * aggTrade streams supply the order book and trade tape. No API key is involved
 * and nothing is simulated — if a feed is down the field stays empty rather than
 * filled.
 */
export function useMarketData(symbol: string): MarketDataResult {
  const [data, setData] = useState<MarketDataState>(() => emptyState(symbol));
  const [orderFlow, setOrderFlow] = useState<OrderFlowState>(emptyOrderFlow);
  const [error, setError] = useState<MarketDataError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<OrderFlowState['streamStatus']>('CONNECTING');

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const streamRef = useRef<StreamHandle | null>(null);
  const activeSymbolRef = useRef(symbol);
  const configRef = useRef<AssetConfig>(findAssetConfig(symbol));

  // Stream state accumulates here between flushes.
  const candlesRef = useRef<Candle[]>([]);
  const derivedRef = useRef<CandleDerived | null>(null);
  const candlesDirtyRef = useRef(false);
  const tickerRef = useRef<Partial<Pick<MarketDataState, 'price' | 'change' | 'percentChange' | 'high' | 'low' | 'open' | 'volume'>>>({});
  const bookRef = useRef<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] } | null>(null);
  const tapeRef = useRef<TradeFeedItem[]>([]);
  const buyerVolumeRef = useRef(0);
  const sellerVolumeRef = useRef(0);
  const dirtyRef = useRef(false);
  // Set while the feed is down so the next LIVE transition triggers a resync.
  const needsResyncRef = useRef(false);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // Commit accumulated stream data to React state on a fixed cadence.
  const flush = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;

    if (candlesDirtyRef.current) {
      candlesDirtyRef.current = false;
      derivedRef.current = deriveCandles(candlesRef.current, configRef.current.precision);
    }

    const derived = derivedRef.current;
    const ticker = tickerRef.current;
    const book = bookRef.current;
    const tape = tapeRef.current;

    setData(prev => ({
      ...prev,
      ...(derived ?? {}),
      ...ticker,
    }));

    setOrderFlow(prev => {
      const buyerVolume = buyerVolumeRef.current;
      const sellerVolume = sellerVolumeRef.current;
      const sum = buyerVolume + sellerVolume;
      return {
        ...prev,
        ...(book ? { bids: book.bids, asks: book.asks } : {}),
        recentTrades: tape,
        buyerVolume,
        sellerVolume,
        volumeDelta: buyerVolume - sellerVolume,
        buyersPercent: sum > 0 ? (buyerVolume / sum) * 100 : 50,
        sellersPercent: sum > 0 ? (sellerVolume / sum) * 100 : 50,
        ...(derived ? { cumulativeDelta: derived.cumulativeDelta } : {}),
        lastUpdate: Date.now(),
      };
    });

    const now = Date.now();
    setLastUpdated(now);
  }, []);

  const seedFromRest = useCallback(async (signal?: AbortSignal) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const config = configRef.current;
      const [candles, ticker] = await Promise.all([
        fetchKlines(config.binanceSymbol, BASE_INTERVAL, BASE_OUTPUT_SIZE, signal),
        fetch24hTicker(config.binanceSymbol, signal).catch(() => null),
      ]);

      if (candles.length === 0) {
        throw new BinanceError('SYMBOL_NOT_FOUND', `No candles returned for ${config.symbol}`, 200);
      }

      candlesRef.current = candles;
      candlesDirtyRef.current = true;

      const currentPrice = candles[candles.length - 1]?.close ?? 0;
      const previousClose = ticker?.previousClose ?? candles[candles.length - 2]?.close ?? currentPrice;
      const change = ticker ? ticker.change : currentPrice - previousClose;
      const percentChange = ticker ? ticker.percentChange : previousClose !== 0 ? (change / previousClose) * 100 : 0;

      tickerRef.current = {
        ...tickerRef.current,
        price: tickerRef.current.price && tickerRef.current.price > 0 ? tickerRef.current.price : currentPrice,
        change,
        percentChange,
        high: ticker?.high ?? Math.max(...candles.map(c => c.high)),
        low: ticker?.low ?? Math.min(...candles.map(c => c.low)),
        open: ticker?.open ?? candles[candles.length - 1]?.open ?? 0,
        volume: ticker?.volume ?? candles[candles.length - 1]?.volume ?? 0,
      };

      dirtyRef.current = true;
      flush();
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(toMarketDataError(err));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [flush]);

  // ---- REST seed + resync on symbol change ----
  useEffect(() => {
    // Switching symbols must not keep showing the previous asset's numbers
    // under the new label, so clear the slate before the new fetch lands.
    if (activeSymbolRef.current !== symbol) {
      activeSymbolRef.current = symbol;
      configRef.current = findAssetConfig(symbol);
      candlesRef.current = [];
      derivedRef.current = null;
      candlesDirtyRef.current = false;
      tickerRef.current = {};
      bookRef.current = null;
      tapeRef.current = [];
      buyerVolumeRef.current = 0;
      sellerVolumeRef.current = 0;
      dirtyRef.current = false;
      needsResyncRef.current = false;
      setData(emptyState(symbol));
      setOrderFlow(emptyOrderFlow());
      setError(null);
      setLastUpdated(null);
      setIsLoading(true);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    seedFromRest(controller.signal);

    return () => {
      controller.abort();
      abortRef.current = null;
      // Release the in-flight flag so a fast symbol switch is not blocked by
      // the previous symbol's request and cannot leave the app stuck loading.
      inFlightRef.current = false;
    };
  }, [symbol, seedFromRest]);

  // ---- Persistent WebSocket: kline, ticker, order book, tape ----
  useEffect(() => {
    const config = findAssetConfig(symbol);
    configRef.current = config;
    // A socket can deliver a message just after it has been closed, so every
    // callback checks that it still belongs to the currently selected symbol.
    let active = true;

    const handle = openMarketStream(
      config.binanceSymbol,
      {
        onStatus: status => {
          if (!active) return;
          setStreamStatus(status);

          if (status === 'LIVE') {
            if (needsResyncRef.current) {
              needsResyncRef.current = false;
              seedFromRest(abortRef.current?.signal);
            }
            setError(prev => (prev?.kind === 'NETWORK' || prev?.kind === 'UPSTREAM' ? null : prev));
          } else if (status === 'RECONNECTING' || status === 'OFFLINE') {
            // The feed is down, so the candle series has a hole; ask for a
            // resync once the next connection is up. A reconnect also starts a
            // new tape window, so the live counters must not carry over.
            needsResyncRef.current = true;
            buyerVolumeRef.current = 0;
            sellerVolumeRef.current = 0;
            tapeRef.current = [];
          }

          setOrderFlow(prev => {
            if (status === 'CONNECTING' || status === 'RECONNECTING') {
              return {
                ...prev,
                streamStatus: status,
                isLive: false,
                buyerVolume: 0,
                sellerVolume: 0,
                volumeDelta: 0,
                buyersPercent: 50,
                sellersPercent: 50,
              };
            }
            return { ...prev, streamStatus: status, isLive: status === 'LIVE' };
          });
        },

        onTicker: payload => {
          if (!active) return;
          const price = num(payload.c, NaN);
          if (!Number.isFinite(price)) return;

          tickerRef.current = {
            price,
            change: num(payload.p, tickerRef.current.change ?? 0),
            percentChange: num(payload.P, tickerRef.current.percentChange ?? 0),
            high: num(payload.h, tickerRef.current.high ?? 0),
            low: num(payload.l, tickerRef.current.low ?? 0),
            open: num(payload.o, tickerRef.current.open ?? 0),
            volume: num(payload.v, tickerRef.current.volume ?? 0),
          };
          markDirty();
        },

        onAggTrade: payload => {
          if (!active) return;
          const trade = tradesFrom(payload);
          if (!trade) return;

          // The tape is the fastest feed Binance offers, so the headline price
          // tracks it directly instead of waiting for the next ticker push.
          tickerRef.current = { ...tickerRef.current, price: trade.price };

          buyerVolumeRef.current += trade.type === 'BUY' ? trade.size : 0;
          sellerVolumeRef.current += trade.type === 'SELL' ? trade.size : 0;
          tapeRef.current = [trade, ...tapeRef.current].slice(0, MAX_TAPE_ITEMS);

          markDirty();
        },

        onKline: payload => {
          if (!active) return;
          const candle = candleFromKline(payload);
          if (!candle) return;

          const series = candlesRef.current;
          const last = series[series.length - 1];

          if (!last) {
            candlesRef.current = [candle];
          } else if (candle.datetime === last.datetime) {
            // Same open candle — Binance pushes an update per trade.
            candlesRef.current = [...series.slice(0, -1), candle];
          } else if (candle.datetime > last.datetime) {
            // A new candle just opened; keep the window at its fixed size.
            candlesRef.current = [...series, candle].slice(-BASE_OUTPUT_SIZE);
          } else {
            return;
          }

          candlesDirtyRef.current = true;
          markDirty();
        },

        onDepth: payload => {
          if (!active) return;
          const bids = levelsFrom(payload.bids);
          const asks = levelsFrom(payload.asks);
          if (bids.length === 0 && asks.length === 0) return;

          bookRef.current = { bids, asks };
          markDirty();
        },
      },
      STREAM_INTERVAL
    );

    streamRef.current = handle;

    return () => {
      active = false;
      handle.close();
      streamRef.current = null;
    };
  }, [symbol, markDirty, seedFromRest]);

  // Fixed-cadence commit of everything the stream has accumulated.
  useEffect(() => {
    const interval = setInterval(flush, STREAM_FLUSH_MS);
    return () => clearInterval(interval);
  }, [flush]);

  // A backgrounded tab can have its socket dropped by the browser; when it comes
  // back into view, resync the candle history if the live stream is not healthy.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      if (streamRef.current && streamStatus !== 'LIVE') {
        needsResyncRef.current = true;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [streamStatus]);

  return {
    data,
    orderFlow,
    dataQuality: assessQuality(data, lastUpdated, streamStatus),
    isLoading,
    error,
    lastUpdated,
    streamStatus,
  };
}
