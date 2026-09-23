import { useState, useEffect, useRef, useCallback } from 'react';
import { useRefinedTradingData } from '../hooks/useRefinedTradingData';
import { useMultiTimeframe } from '../hooks/useMultiTimeframe';
import { useMarketContextEngine } from '../hooks/useMarketContextEngine';
import { useMacroContext } from '../hooks/useMacroContext';
import { useFundamentalIntelligence, useFundamentalBias, usePositionSizing } from '../hooks/useFundamentalIntelligence';
import { IndicatorSummary } from '../types/trading';
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
  dataLabelColor,
} from '../lib/compassEngine';

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

export const useCompassSignal = (): CompassEngineHookResult => {
  const [official, setOfficial] = useState<OfficialCompassState | null>(null);
  const [live, setLive] = useState<LiveAnalysisState | null>(null);
  const [history, setHistory] = useState<SignalHistoryEntry[]>([]);
  const [config, setConfig] = useState<CompassEngineConfig>(DEFAULT_COMPASS_CONFIG);
  const [secondsUntilNextUpdate, setSecondsUntilNextUpdate] = useState(secondsUntilNextMinute());

  const tradingData = useRefinedTradingData();
  const mtfResult = useMultiTimeframe('PAXGUSDT', tradingData.price);
  const marketContext = useMarketContextEngine(tradingData);
  const macroContext = useMacroContext(tradingData.price, marketContext.ema200Value, { macroUpdateIntervalMs: 30000 });
  const fundamentalIntelligence = useFundamentalIntelligence(tradingData.price, 60000);

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
  }, [historyRef.current]);

  // Compute live analysis whenever core data changes
  useEffect(() => {
    if (!tradingData.price || tradingData.price <= 0) {
      liveRef.current = null;
      return;
    }

    // Build factor contributions from all available sources
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
        weight: Math.min(100, Math.round((total > 0 ? buyCount / total : 0) * 100)),
        value: `${buyCount} buy / ${sellCount} sell`,
        confidence: marketContext.dataQuality?.overall || 50,
      });
    }

    // 2. Multi-timeframe alignment
    if (mtfResult) {
      const buyCount = mtfResult.timeframes.filter(t => t.direction === 'BUY').length;
      const sellCount = mtfResult.timeframes.filter(t => t.direction === 'SELL').length;
      const total = mtfResult.timeframes.length;

      if (total > 0) {
        const bullishPct = buyCount / total;
        const bearishPct = sellCount / total;

        factors.push({
          category: 'STRUCTURE',
          name: 'MTF_ALIGNMENT',
          direction: bullishPct > bearishPct ? 'BULLISH' : bearishPct > bearishPct ? 'BEARISH' : 'NEUTRAL',
          weight: Math.round((total > 0 ? Math.max(buyCount, sellCount) / total : 0) * 100),
          value: `${buyCount} BUY / ${sellCount} SELL / ${total - buyCount - sellCount} NEUTRAL`,
          confidence: mtfResult.weightedScore > 0 ? 80 : 60,
        });
      }
    }

    // 3. Fundamental intelligence factors
    if (fundamentalIntelligence) {
      const { riskSentiment, goldVolatility } = fundamentalIntelligence;

      if (goldVolatility === 'EXTREME') {
        factors.push({
          category: 'VOLATILITY',
          name: 'GOLD_VOLATILITY',
          direction: 'BEARISH',
          weight: 10,
          value: 'EXTREME',
          confidence: 70,
        });
      } else if (goldVolatility === 'HIGH') {
        factors.push({
          category: 'VOLATILITY',
          name: 'GOLD_VOLATILITY',
          direction: 'BEARISH',
          weight: 8,
          value: 'HIGH',
          confidence: 70,
        });
      }

      if (riskSentiment === 'RISK_ON') {
        factors.push({
          category: 'FUNDAMENTAL',
          name: 'RISK_SENTIMENT',
          direction: 'BULLISH',
          weight: 15,
          value: riskSentiment,
          confidence: 80,
        });
      } else if (riskSentiment === 'RISK_OFF') {
        factors.push({
          category: 'FUNDAMENTAL',
          name: 'RISK_SENTIMENT',
          direction: 'BEARISH',
          weight: 15,
          value: riskSentiment,
          confidence: 80,
        });
      }
    }

    // 4. Macro context factors
    if (macroContext) {
      const { bias, dxyTrend, yieldsTrend, riskRegime } = macroContext;

      if (bias === 'BULLISH') {
        factors.push({
          category: 'MACRO',
          name: 'MACRO_BIAS',
          direction: 'BULLISH',
          weight: 10,
          value: `${riskRegime} / ${dxyTrend} DXY / ${yieldsTrend} yields`,
          confidence: 75,
        });
      } else if (bias === 'BEARISH') {
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

    // Compute live analysis
    const timestamp = Date.now();
    const minuteKey = minuteKeyFromTimestamp(timestamp);

    const liveState = computeLiveAnalysis({
      factors,
      price: tradingData.price,
      dataQuality: tradingData.dataQuality?.overall || 50,
      dataLabel: tradingData.dataQuality?.freshness || 'DELAYED',
      marketRegime: marketContext.uiSummary?.state || 'UNKNOWN',
      timestamp,
      minuteKey,
    }, config);

    liveRef.current = liveState;
    setLive(liveState);
  }, [tradingData.price, tradingData.dataQuality, marketContext.uiSummary, mtfResult, fundamentalIntelligence, macroContext, config]);

  // Timer-based minute boundary check
  useEffect(() => {
    const checkMinuteBoundary = () => {
      if (!liveRef.current) return;

      const currentMinuteKey = liveRef.current.minuteKey;
      const lastMinuteKey = lastMinuteKeyRef.current;

      // Check if minute has changed
      if (currentMinuteKey && currentMinuteKey !== lastMinuteKey) {
        // Prevent duplicate publishes within the same minute
        if (pendingPublishRef.current) return;

        pendingPublishRef.current = true;

        // Publish official signal
        const officialState = publishOfficialSignal(
          liveRef.current,
          officialRef.current,
          config
        );

        if (officialState) {
          officialRef.current = officialState;
          setOfficial(officialState);
          historyRef.current = addToHistory(historyRef.current, officialState);
          setHistory([...historyRef.current]);
        }

        // Reset pending flag after a short delay to allow for minute boundary
        setTimeout(() => {
          pendingPublishRef.current = false;
        }, 1000);

        // Update last minute key
        lastMinuteKeyRef.current = currentMinuteKey;
      }
    };

    // Check every second
    checkMinuteBoundary();
    const interval = setInterval(checkMinuteBoundary, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update countdown to next update
  useEffect(() => {
    const updateCountdown = () => {
      setSecondsUntilNextUpdate(secondsUntilNextMinute());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Derived UI values
  const directionLabel = officialRef.current?.direction
    ? formatCompassDirection(officialRef.current.direction)
    : liveRef.current?.rawDirection
      ? formatCompassDirection(liveRef.current.rawDirection)
      : 'NEUTRAL';

  const directionColorValue = officialRef.current?.direction
    ? directionColor(officialRef.current.direction)
    : liveRef.current?.rawDirection
      ? directionColor(liveRef.current.rawDirection)
      : '#f59e0b';

  const dataLabel: DataLabel = officialRef.current?.dataLabel || liveRef.current?.dataLabel || 'DELAYED';

  const minutesSinceLastSignal = officialRef.current
    ? Math.round((Date.now() - new Date(officialRef.current.timestamp).getTime()) / 60000)
    : 0;

  const refresh = useCallback(() => {
    // Clear refs to force recomputation
    liveRef.current = null;
    officialRef.current = null;
    lastMinuteKeyRef.current = null;
    pendingPublishRef.current = false;
  }, []);

  const setConfigAction = useCallback((partial: Partial<CompassEngineConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  return {
    official: officialRef.current,
    live: liveRef.current,
    history: historyRef.current,
    directionLabel,
    directionColor: directionColorValue,
    dataLabel,
    secondsUntilNextUpdate,
    minutesSinceLastSignal,
    config,
    refresh,
    setConfig: setConfigAction,
  };
};