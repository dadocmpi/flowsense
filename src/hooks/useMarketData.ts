import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTimeSeries, TwelveDataError } from '../lib/twelveDataClient';
import { BUDGET_LIMITS, getBudgetSnapshot, trySpendCredit } from '../lib/creditBudget';
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
  findAssetConfig,
} from '../types/trading';
import type { Candle } from '../lib/indicators';

export const BASE_INTERVAL = '5min';
const BASE_OUTPUT_SIZE = 300;
const DEFAULT_REFRESH_SECONDS = 60;

function emptyState(symbol: string): MarketDataState {
  const config = findAssetConfig(symbol);
  return {
    symbol: config.symbol,
    name: config.name,
    exchange: config.exchange,
    currency: '',
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
    isMarketOpen: false,
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

function toMarketDataError(error: unknown): MarketDataError {
  if (error instanceof TwelveDataError) {
    return { kind: error.kind, message: error.message };
  }
  return { kind: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown error' };
}

function assessQuality(data: MarketDataState, lastUpdated: number | null): DataQualityScore {
  const age = lastUpdated ? Date.now() - lastUpdated : Number.POSITIVE_INFINITY;
  const freshness: DataQualityScore['metrics']['freshness'] =
    data.price <= 0
      ? 'DISCONNECTED'
      : age < DEFAULT_REFRESH_SECONDS * 3_000
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
    source: data.price > 0 ? ('TWELVE_DATA' as const) : ('UNAVAILABLE' as const),
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

/**
 * Loads real market data from Twelve Data through the server-side proxy.
 *
 * Twelve Data's free plan has no WebSocket and a small credit budget, so this
 * hook polls a single `time_series` request per cycle, derives every indicator
 * and higher timeframe locally, and pauses while the tab is hidden.
 */
export function useMarketData(symbol: string, refreshSeconds = DEFAULT_REFRESH_SECONDS): MarketDataResult {
  const [data, setData] = useState<MarketDataState>(() => emptyState(symbol));
  const [error, setError] = useState<MarketDataError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(refreshSeconds);
  const [refreshToken, setRefreshToken] = useState(0);

  const lastUpdatedRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(() => {
    setRefreshToken(token => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (inFlightRef.current) return;

      const budget = getBudgetSnapshot();
      if (!budget.canSpend) {
        setError({
          kind: 'BUDGET_EXHAUSTED',
          message: `API credit budget reached (${budget.dayUsed}/${BUDGET_LIMITS.day} today). Retrying shortly.`,
        });
        setIsLoading(false);
        return;
      }

      inFlightRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      if (!trySpendCredit()) {
        inFlightRef.current = false;
        setError({ kind: 'BUDGET_EXHAUSTED', message: 'API credit budget reached.' });
        setIsLoading(false);
        return;
      }

      try {
        const config = findAssetConfig(symbol);
        const series = await fetchTimeSeries(config.symbol, BASE_INTERVAL, BASE_OUTPUT_SIZE, {
          signal: controller.signal,
        });

        if (cancelled) return;

        const candles = series.candles;
        const indicators = buildIndicators(candles, config.precision);
        const ranges = deriveRanges(candles);

        const currentPrice = candles[candles.length - 1]?.close ?? 0;
        const previousClose = ranges.previousDay?.close ?? candles[candles.length - 2]?.close ?? currentPrice;
        const change = currentPrice - previousClose;
        const percentChange = previousClose !== 0 ? (change / previousClose) * 100 : 0;

        const overallSummary = buildSummary([
          ...indicators.oscillators,
          ...indicators.movingAverages,
          ...indicators.volumeIndicators,
        ]);

        const sessionHigh = ranges.session?.high ?? Math.max(...candles.slice(-78).map(c => c.high));
        const sessionLow = ranges.session?.low ?? Math.min(...candles.slice(-78).map(c => c.low));

        const now = Date.now();

        setData({
          symbol: config.symbol,
          name: config.name,
          exchange: config.exchange,
          currency: '',
          precision: config.precision,
          price: currentPrice,
          change,
          percentChange,
          high: sessionHigh,
          low: sessionLow,
          open: ranges.session?.open ?? candles[candles.length - 1]?.open ?? 0,
          previousClose,
          volume: candles[candles.length - 1]?.volume ?? 0,
          averageVolume:
            candles.length > 0 ? candles.slice(-20).reduce((acc, c) => acc + c.volume, 0) / Math.min(20, candles.length) : 0,
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
    };
  }, [symbol, refreshToken]);

  // Polling loop, paused while the tab is hidden.
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
    dataQuality: assessQuality(data, lastUpdated),
    isLoading,
    error,
    lastUpdated,
    nextRefreshIn,
    refresh,
  };
}

/**
 * Derives higher timeframes by aggregating the base candles locally, so no
 * additional API credits are spent.
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
