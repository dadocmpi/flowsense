import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BinanceError,
  fetch24hTicker,
  fetchKlines,
  openMarketStream,
  type StreamHandle,
} from '../lib/binanceClient';
import {
  aggregateCandles,
  buildIndicators,
  buildSummary,
  deriveRanges,
  intervalToMinutes,
} from '../lib/marketAnalysis';
import {
  DataQualityScore,
  MarketDataError,
  MarketDataResult,
  MarketDataState,
  OrderBookLevel,
  OrderFlowState,
  TradeFeedItem,
  findAssetConfig,
} from '../types/trading';
import type { Candle } from '../lib/indicators';

export const BASE_INTERVAL = '5min';
const BASE_OUTPUT_SIZE = 300;
/** REST klines are re-fetched this often; the live stream carries the price in between. */
const DEFAULT_REFRESH_SECONDS = 60;
const MAX_TAPE_ITEMS = 50;

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

function assessQuality(data: MarketDataState, lastUpdated: number | null, isLive: boolean): DataQualityScore {
  const age = lastUpdated ? Date.now() - lastUpdated : Number.POSITIVE_INFINITY;
  const freshness: DataQualityScore['metrics']['freshness'] =
    data.price <= 0
      ? 'DISCONNECTED'
      : isLive || age < DEFAULT_REFRESH_SECONDS * 3_000
        ? 'LIVE'
        : age < DEFAULT_REFRESH_SECONDS * 10_000
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

/**
 * Loads real market data from Binance's public API.
 *
 * REST supplies the candle history (including the real taker-buy split per
 * candle); the public WebSocket stream supplies the live ticker, the top-10
 * order book and the aggregated trade tape. No API key is involved and nothing
 * is simulated — if a feed is down the field stays empty rather than filled.
 */
export function useMarketData(symbol: string, refreshSeconds = DEFAULT_REFRESH_SECONDS): MarketDataResult {
  const [data, setData] = useState<MarketDataState>(() => emptyState(symbol));
  const [orderFlow, setOrderFlow] = useState<OrderFlowState>(emptyOrderFlow);
  const [error, setError] = useState<MarketDataError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(refreshSeconds);
  const [refreshToken, setRefreshToken] = useState(0);

  const lastUpdatedRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const streamRef = useRef<StreamHandle | null>(null);
  const activeSymbolRef = useRef(symbol);

  const refresh = useCallback(() => {
    setRefreshToken(token => token + 1);
  }, []);

  // ---- REST: candles, ticker, indicators ----
  useEffect(() => {
    let cancelled = false;

    // Switching symbols must not keep showing the previous asset's numbers
    // under the new label, so clear the slate before the new fetch lands.
    if (activeSymbolRef.current !== symbol) {
      activeSymbolRef.current = symbol;
      setData(emptyState(symbol));
      setOrderFlow(emptyOrderFlow());
      setError(null);
      setLastUpdated(null);
      lastUpdatedRef.current = null;
      setIsLoading(true);
    }

    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const config = findAssetConfig(symbol);

        const [candles, ticker] = await Promise.all([
          fetchKlines(config.binanceSymbol, BASE_INTERVAL, BASE_OUTPUT_SIZE, controller.signal),
          fetch24hTicker(config.binanceSymbol, controller.signal).catch(() => null),
        ]);

        if (cancelled) return;
        if (candles.length === 0) {
          throw new BinanceError('SYMBOL_NOT_FOUND', `No candles returned for ${config.symbol}`, 200);
        }

        const indicators = buildIndicators(candles, config.precision);
        const ranges = deriveRanges(candles);

        const currentPrice = candles[candles.length - 1]?.close ?? 0;
        const previousClose = ticker?.previousClose ?? candles[candles.length - 2]?.close ?? currentPrice;
        const change = ticker ? ticker.change : currentPrice - previousClose;
        const percentChange = ticker ? ticker.percentChange : previousClose !== 0 ? (change / previousClose) * 100 : 0;

        const overallSummary = buildSummary([
          ...indicators.oscillators,
          ...indicators.movingAverages,
          ...indicators.volumeIndicators,
        ]);

        const now = Date.now();

        setData({
          symbol: config.symbol,
          name: config.name,
          exchange: config.exchange,
          currency: config.quote,
          precision: config.precision,
          price: currentPrice,
          change,
          percentChange,
          high: ticker?.high ?? (candles.length > 0 ? Math.max(...candles.map(c => c.high)) : 0),
          low: ticker?.low ?? (candles.length > 0 ? Math.min(...candles.map(c => c.low)) : 0),
          open: ticker?.open ?? ranges.session?.open ?? candles[candles.length - 1]?.open ?? 0,
          previousClose,
          volume: ticker?.volume ?? candles[candles.length - 1]?.volume ?? 0,
          averageVolume:
            candles.length > 0
              ? candles.slice(-20).reduce((acc, c) => acc + c.volume, 0) / Math.min(20, candles.length)
              : 0,
          datetime: candles[candles.length - 1]?.datetime ?? '',
          isMarketOpen: true,
          candles,
          oscillators: indicators.oscillators,
          movingAverages: indicators.movingAverages,
          volumeIndicators: indicators.volumeIndicators,
          overallSummary,
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
        });

        // Cumulative delta over the candle window, from the real per-candle
        // taker-buy split. Kept separate from the live tape counters below so
        // the two windows are never mixed into one misleading number.
        const withSplit = candles.filter(c => c.takerBuyVolume !== undefined);
        if (withSplit.length > 0) {
          const windowBuy = withSplit.reduce((acc, c) => acc + (c.takerBuyVolume ?? 0), 0);
          const windowTotal = withSplit.reduce((acc, c) => acc + c.volume, 0);
          const windowSell = Math.max(0, windowTotal - windowBuy);
          setOrderFlow(prev => ({ ...prev, cumulativeDelta: windowBuy - windowSell }));
        }

        lastUpdatedRef.current = now;
        setLastUpdated(now);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (cancelled) return;
        setError(toMarketDataError(err));
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      // Release the in-flight flag here rather than only in the fetch's
      // finally, so a fast symbol switch is not blocked by the previous
      // symbol's request and cannot leave the app stuck loading.
      inFlightRef.current = false;
    };
  }, [symbol, refreshToken]);

  // ---- WebSocket: live ticker, order book, tape ----
  useEffect(() => {
    const config = findAssetConfig(symbol);
    // A socket can deliver a message just after it has been closed, so every
    // callback checks that it still belongs to the currently selected symbol.
    let active = true;

    const handle = openMarketStream(config.binanceSymbol, {
      onStatus: status => {
        if (!active) return;
        setOrderFlow(prev => {
          // A reconnect starts a new tape window, so the live counters must not
          // carry over from the previous connection.
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
        if (status === 'LIVE') {
          setError(prev => (prev?.kind === 'NETWORK' || prev?.kind === 'UPSTREAM' ? null : prev));
        }
      },

      onTicker: payload => {
        if (!active) return;
        const price = num(payload.c, NaN);
        if (!Number.isFinite(price)) return;

        const now = Date.now();
        lastUpdatedRef.current = now;
        setLastUpdated(now);

        setData(prev => ({
          ...prev,
          price,
          change: num(payload.p, prev.change),
          percentChange: num(payload.P, prev.percentChange),
          high: num(payload.h, prev.high),
          low: num(payload.l, prev.low),
        }));
      },

      onDepth: payload => {
        if (!active) return;
        const bids = levelsFrom(payload.bids);
        const asks = levelsFrom(payload.asks);
        if (bids.length === 0 && asks.length === 0) return;

        setOrderFlow(prev => ({ ...prev, bids, asks, lastUpdate: Date.now() }));
      },

      onAggTrade: payload => {
        if (!active) return;
        const trade = tradesFrom(payload);
        if (!trade) return;

        setOrderFlow(prev => {
          const buyerVolume = prev.buyerVolume + (trade.type === 'BUY' ? trade.size : 0);
          const sellerVolume = prev.sellerVolume + (trade.type === 'SELL' ? trade.size : 0);
          const sum = buyerVolume + sellerVolume;

          return {
            ...prev,
            recentTrades: [trade, ...prev.recentTrades].slice(0, MAX_TAPE_ITEMS),
            buyerVolume,
            sellerVolume,
            volumeDelta: buyerVolume - sellerVolume,
            buyersPercent: sum > 0 ? (buyerVolume / sum) * 100 : 50,
            sellersPercent: sum > 0 ? (sellerVolume / sum) * 100 : 50,
            lastUpdate: Date.now(),
          };
        });
      },
    });

    streamRef.current = handle;

    return () => {
      active = false;
      handle.close();
      streamRef.current = null;
    };
  }, [symbol]);

  // Polling loop for the REST refresh, paused while the tab is hidden.
  useEffect(() => {
    let remaining = refreshSeconds;

    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        remaining = refreshSeconds;
        setNextRefreshIn(remaining);
        return;
      }

      remaining -= 1;
      if (remaining <= 0) {
        remaining = refreshSeconds;
        setRefreshToken(token => token + 1);
      }
      setNextRefreshIn(remaining);
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [refreshSeconds]);

  return {
    data,
    orderFlow,
    dataQuality: assessQuality(data, lastUpdated, orderFlow.isLive),
    isLoading,
    error,
    lastUpdated,
    nextRefreshIn,
    refresh,
  };
}

/**
 * Derives higher timeframes by aggregating the base candles locally, so no
 * additional requests are spent.
 */
export function useDerivedCandles(candles: Candle[], intervalMinutes: number): Candle[] {
  const [derived, setDerived] = useState<Candle[]>([]);

  useEffect(() => {
    if (candles.length === 0) {
      setDerived([]);
      return;
    }
    setDerived(intervalMinutes <= intervalToMinutes(BASE_INTERVAL) ? candles : aggregateCandles(candles, intervalMinutes));
  }, [candles, intervalMinutes]);

  return derived;
}
