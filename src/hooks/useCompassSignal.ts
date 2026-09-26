import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMarketData } from './useMarketData';
import { useMultiTimeframe } from './useMultiTimeframe';
import { useMarketContextEngine } from './useMarketContextEngine';
import { useMacroContext } from './useMacroContext';
import { useFundamentalIntelligence } from './useFundamentalIntelligence';
import { useSrReversal } from './useSrReversal';
import { findAssetConfig } from '../types/trading';
import type { Candle } from '../lib/indicators';
import type { MarketDataError, MarketDataState, DataQualityScore } from '../types/trading';
import {
  FactorContribution,
  LiveAnalysisState,
  OfficialCompassState,
  CompassDirection,
  DataLabel,
  CompassEngineConfig,
  DEFAULT_COMPASS_CONFIG,
  computeLiveAnalysis,
  publishOfficialSignal,
  addToHistory,
  secondsUntilNextMinute,
  minuteKeyFromTimestamp,
  formatCompassDirection,
  directionColor,
} from '../lib/compassEngine';
import { ReversalSignal, SRLevel } from '../types/srReversal';

export interface CompassEngineHookResult {
  official: OfficialCompassState | null;
  live: LiveAnalysisState | null;
  history: SignalHistoryEntry[];
  directionLabel: string;
  directionColor: string;
  dataLabel: DataLabel;
  secondsUntilNextUpdate: number;
  minutesSinceLastSignal: number;
  config: CompassEngineConfig;
  refresh: () => void;
  setConfig: (partial: Partial<CompassEngineConfig>) => void;
  reversalSignal: ReversalSignal | null;
  srLevels: SRLevel[];
  // Market data passthrough
  marketData: MarketDataState;
  candles: Candle[];
  price: number;
  precision: number;
  assetName: string;
  dataQuality: DataQualityScore;
  isLoading: boolean;
  error: MarketDataError | null;
  nextRefreshIn: number;
  lastUpdated: number | null;
}

export interface SignalHistoryEntry {
  minuteKey: string;
  direction: CompassDirection;
  score: number;
  confidence: number;
  price: number;
  marketRegime: string;
  dataQuality: number;
  dataLabel: DataLabel;
  timestamp: number;
  factorSummary: string[];
}

function dataLabelFromQuality(quality: DataQualityScore): DataLabel {
  switch (quality.metrics.freshness) {
    case 'LIVE':
      return 'LIVE';
    case 'DELAYED':
      return 'DELAYED';
    case 'STALE':
      return 'CACHED';
    default:
      return 'UNAVAILABLE';
  }
}

export const useCompassSignal = (symbol = 'XAU/USD'): CompassEngineHookResult => {
  const [official, setOfficial] = useState<OfficialCompassState | null>(null);
  const [live, setLive] = useState<LiveAnalysisState | null>(null);
  const [history, setHistory] = useState<SignalHistoryEntry[]>([]);
  const [config, setConfig] = useState<CompassEngineConfig>(DEFAULT_COMPASS_CONFIG);
  const [secondsUntilNextUpdate, setSecondsUntilNextUpdate] = useState(secondsUntilNextMinute());

  const assetConfig = findAssetConfig(symbol);

  const marketData = useMarketData(symbol);
  const { data, dataQuality, error, isLoading, lastUpdated, nextRefreshIn } = marketData;

  const mtfResult = useMultiTimeframe(data.candles, '5min');
  const marketContext = useMarketContextEngine(data);
  const macroContext = useMacroContext(data.candles);
  const fundamentalIntelligence = useFundamentalIntelligence(data.candles, data.price, 60000);
  const srReversal = useSrReversal(data.candles, data.price, dataQuality.overall, {
    session: data.session,
    previousDay: data.previousDay,
    weekly: data.weekly,
    openingRange: data.openingRange,
  }, mtfResult);

  // Refs for storing latest values
  const liveRef = useRef<LiveAnalysisState | null>(null);
  const officialRef = useRef<OfficialCompassState | null>(null);
  const historyRef = useRef<SignalHistoryEntry[]>([]);
  const lastMinuteKeyRef = useRef<string | null>(null);
  const pendingPublishRef = useRef<boolean>(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('compass_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          historyRef.current = parsed;
          setHistory(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load compass history from localStorage:', e);
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('compass_history', JSON.stringify(historyRef.current));
    } catch (e) {
      console.warn('Failed to save compass history to localStorage:', e);
    }
  }, [history]);

  // Compute live analysis whenever core data changes
  useEffect(() => {
    if (!data.price || data.price <= 0) {
      liveRef.current = null;
      return;
    }

    const factors: FactorContribution[] = [];

    // 1. Market Context Engine factors
    if (marketContext.uiSummary) {
      const buyCount = marketContext.uiSummary.buyCount || 0;
      const sellCount = marketContext.uiSummary.sellCount || 0;
      const total = buyCount + sellCount || 1;
      const score = marketContext.uiSummary.score || 50;

      factors.push({
        category: 'ZONE_CLUSTER',
        name: 'MARKET_CONTEXT',
        direction: score >= 60 ? 'BULLISH' : score <= 40 ? 'BEARISH' : 'NEUTRAL',
        weight: Math.min(100, Math.round((buyCount / total) * 100)),
        value: `${buyCount} buy / ${sellCount} sell`,
        confidence: marketContext.dataQuality?.overall || 50,
      });
    }

    // 2. Multi-timeframe alignment
    if (mtfResult && mtfResult.timeframes.length > 0) {
      const buyCount = mtfResult.timeframes.filter(t => t.direction === 'BUY').length;
      const sellCount = mtfResult.timeframes.filter(t => t.direction === 'SELL').length;
      const total = mtfResult.timeframes.length;

      factors.push({
        category: 'STRUCTURE',
        name: 'MTF_ALIGNMENT',
        direction: buyCount > sellCount ? 'BULLISH' : sellCount > buyCount ? 'BEARISH' : 'NEUTRAL',
        weight: Math.round((Math.max(buyCount, sellCount) / total) * 100),
        value: `${buyCount} BUY / ${sellCount} SELL / ${total - buyCount - sellCount} NEUTRAL`,
        confidence: 60 + Math.round((Math.abs(mtfResult.weightedScore) / 100) * 30),
      });
    }

    // 3. Technical indicator summaries (from real candles)
    if (data.overallSummary) {
      const score = data.overallSummary.score;
      factors.push({
        category: 'OSCILLATOR',
        name: 'TECHNICAL_SUMMARY',
        direction: score >= 60 ? 'BULLISH' : score <= 40 ? 'BEARISH' : 'NEUTRAL',
        weight: 20,
        value: `${data.overallSummary.verdict} (${score}%)`,
        confidence: dataQuality.overall,
      });
    }

    // 4. Volatility regime (from real ATR)
    if (fundamentalIntelligence) {
      const { volatilityRegime, atrPercent } = fundamentalIntelligence;

      if (volatilityRegime === 'EXTREME' || volatilityRegime === 'HIGH') {
        factors.push({
          category: 'VOLATILITY',
          name: 'VOLATILITY_REGIME',
          direction: 'BEARISH',
          weight: volatilityRegime === 'EXTREME' ? 10 : 8,
          value: atrPercent !== null ? `${volatilityRegime} (ATR ${atrPercent.toFixed(2)}%)` : volatilityRegime,
          confidence: 70,
        });
      } else if (volatilityRegime === 'LOW') {
        factors.push({
          category: 'VOLATILITY',
          name: 'VOLATILITY_REGIME',
          direction: 'NEUTRAL',
          weight: 5,
          value: atrPercent !== null ? `LOW (ATR ${atrPercent.toFixed(2)}%)` : 'LOW',
          confidence: 65,
        });
      }
    }

    // 5. Macro context factors
    if (macroContext) {
      const { bias, dxyTrend, yieldsTrend, riskRegime } = macroContext;

      if (bias === 'BULLISH' || bias === 'STRONG_BULLISH') {
        factors.push({
          category: 'MACRO',
          name: 'MACRO_BIAS',
          direction: 'BULLISH',
          weight: 10,
          value: `${riskRegime} / ${dxyTrend} DXY / ${yieldsTrend} yields`,
          confidence: 75,
        });
      } else if (bias === 'BEARISH' || bias === 'STRONG_BEARISH') {
        factors.push({
          category: 'MACRO',
          name: 'MACRO_BIAS',
          direction: 'BEARISH',
          weight: 10,
          value: `${riskRegime} / ${dxyTrend} DXY / ${yieldsTrend} yields`,
          confidence: 75,
        });
      }
    }

    // 6. SR/R factors
    factors.push(...srReversal.factors);

    const timestamp = Date.now();
    const minuteKey = minuteKeyFromTimestamp(timestamp);

    const liveState = computeLiveAnalysis({
      factors,
      price: data.price,
      dataQuality: dataQuality.overall,
      dataLabel: dataLabelFromQuality(dataQuality),
      marketRegime: marketContext.uiSummary?.state || 'UNKNOWN',
      timestamp,
      minuteKey,
    }, config);

    liveRef.current = liveState;
    setLive(liveState);
  }, [
    data.price,
    data.overallSummary,
    dataQuality,
    marketContext.uiSummary,
    mtfResult,
    fundamentalIntelligence,
    macroContext,
    config,
    srReversal.factors,
  ]);

  // Timer-based minute boundary check
  useEffect(() => {
    const checkMinuteBoundary = () => {
      if (!liveRef.current) return;

      const currentMinuteKey = liveRef.current.minuteKey;
      const lastMinuteKey = lastMinuteKeyRef.current;

      if (currentMinuteKey && currentMinuteKey !== lastMinuteKey) {
        if (pendingPublishRef.current) return;
        pendingPublishRef.current = true;

        const officialState = publishOfficialSignal(liveRef.current, officialRef.current, config);

        if (officialState) {
          officialRef.current = officialState;
          setOfficial(officialState);
          historyRef.current = addToHistory(historyRef.current, officialState);
          setHistory([...historyRef.current]);
        }

        setTimeout(() => {
          pendingPublishRef.current = false;
        }, 1000);

        lastMinuteKeyRef.current = currentMinuteKey;
      }
    };

    checkMinuteBoundary();
    const interval = setInterval(checkMinuteBoundary, 1000);
    return () => clearInterval(interval);
  }, [config]);

  // Update countdown to next update
  useEffect(() => {
    const updateCountdown = () => {
      setSecondsUntilNextUpdate(secondsUntilNextMinute());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const directionLabel = official?.direction
    ? formatCompassDirection(official.direction)
    : live?.rawDirection
      ? formatCompassDirection(live.rawDirection)
      : 'NEUTRAL';

  const directionColorValue = official?.direction
    ? directionColor(official.direction)
    : live?.rawDirection
      ? directionColor(live.rawDirection)
      : '#f59e0b';

  const dataLabel: DataLabel = dataLabelFromQuality(dataQuality);

  const minutesSinceLastSignal = official
    ? Math.round((Date.now() - new Date(official.timestamp).getTime()) / 60000)
    : 0;

  const refresh = useCallback(() => {
    marketData.refresh();
  }, [marketData]);

  const setConfigAction = useCallback((partial: Partial<CompassEngineConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  return useMemo(() => ({
    official,
    live,
    history,
    directionLabel,
    directionColor: directionColorValue,
    dataLabel,
    secondsUntilNextUpdate,
    minutesSinceLastSignal,
    config,
    refresh,
    setConfig: setConfigAction,
    reversalSignal: srReversal.reversalSignal,
    srLevels: srReversal.srLevels,
    marketData: data,
    candles: data.candles,
    price: data.price,
    precision: assetConfig.precision,
    assetName: assetConfig.name,
    dataQuality,
    isLoading,
    error,
    nextRefreshIn,
    lastUpdated,
  }), [
    official,
    live,
    history,
    directionLabel,
    directionColorValue,
    dataLabel,
    secondsUntilNextUpdate,
    minutesSinceLastSignal,
    config,
    refresh,
    setConfigAction,
    srReversal.reversalSignal,
    srReversal.srLevels,
    data,
    data.candles,
    data.price,
    assetConfig.precision,
    assetConfig.name,
    dataQuality,
    isLoading,
    error,
    nextRefreshIn,
    lastUpdated,
  ]);
};
