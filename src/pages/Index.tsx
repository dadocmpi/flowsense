import React, { useState, useMemo } from 'react';
import { useRefinedTradingData } from '../hooks/useRefinedTradingData';
import { useMultiTimeframe } from '../hooks/useMultiTimeframe';
import { useMarketContextEngine } from '../hooks/useMarketContextEngine';
import { useMacroContext } from '../hooks/useMacroContext';
import { useFundamentalIntelligence, useFundamentalBias, usePositionSizing } from '../hooks/useFundamentalIntelligence';
import { 
  TradingViewGauge, 
  buildOverallComposite 
} from '../components/trading/TradingViewGauge';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { SUPPORTED_ASSETS, IndicatorSummary } from '../types/trading';
import { cn } from '@/lib/utils';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('MGC1!');
  const tradingData = useRefinedTradingData(selectedAsset);

  const activeConfig = SUPPORTED_ASSETS.find(asset => asset.symbol === selectedAsset) || SUPPORTED_ASSETS[0];
  const binanceSymbol = activeConfig.binanceSymbol || 'PAXGUSDT';

  const displayNameMap: Record<string, string> = {
    'MGC1!': 'GOLD',
    'ES1!': 'SP500'
  };

  // Multi-timeframe
  const mtfResult = useMultiTimeframe(binanceSymbol, tradingData.price);

  // Market Context Engine (SMC/ICT + Order Flow intelligence)
  const marketContext = useMarketContextEngine(tradingData);
  
  // Macro Context (fundamental/session analysis)
  const macroContext = useMacroContext(
    tradingData.price,
    marketContext.ema200Value,
    {
      macroUpdateIntervalMs: 30000, // 30 seconds
      quietZoneBeforeEventMin: 30,
      quietZoneAfterEventMin: 15,
    }
  );

  // Fundamental Intelligence (economic calendar, cross-market, monetary policy)
  const fundamentalIntelligence = useFundamentalIntelligence(
    selectedAsset === 'MGC1!' ? tradingData.price : 0, // Gold price for XAU/USD
    60000 // Update every minute
  );
  
  // Fundamental bias and position sizing
  const fundamentalBias = useFundamentalBias(fundamentalIntelligence);
  const positionSizing = usePositionSizing(fundamentalIntelligence);

  // True OVERALL composite from market context engine
  const overallComposite: IndicatorSummary = useMemo(() => {
    if (!marketContext.isInitialized || !marketContext.uiSummary) {
      // Fallback to refined trading data if engine not ready
      return tradingData.overallSummary;
    }
    
    return {
      buyCount: marketContext.uiSummary.buyCount,
      neutralCount: marketContext.uiSummary.neutralCount,
      sellCount: marketContext.uiSummary.sellCount,
      score: marketContext.uiSummary.score,
      verdict: marketContext.uiSummary.verdict as IndicatorSummary['verdict'],
    };
  }, [marketContext.isInitialized, marketContext.uiSummary, tradingData.overallSummary]);

  // Multi-timeframe summary from engine (if available) or fallback
  const mtfSummary: IndicatorSummary = useMemo(() => {
    if (marketContext.structure) {
      const { htfTrend, mtfTrend, ltfTrend } = marketContext.structure;
      const buyCount = 
        (htfTrend === 'BULLISH' ? 1 : 0) +
        (mtfTrend === 'BULLISH' ? 1 : 0) +
        (ltfTrend === 'BULLISH' ? 1 : 0);
      const sellCount = 
        (htfTrend === 'BEARISH' ? 1 : 0) +
        (mtfTrend === 'BEARISH' ? 1 : 0) +
        (ltfTrend === 'BEARISH' ? 1 : 0);
      const neutralCount = 3 - buyCount - sellCount;
      const score = Math.round((buyCount / 3) * 100);
      
      return {
        buyCount,
        neutralCount,
        sellCount,
        score,
        verdict: score >= 66 ? 'BUY' : score <= 33 ? 'SELL' : 'NEUTRAL' as IndicatorSummary['verdict'],
      };
    }
    
    // Fallback to simple MTF from useMultiTimeframe
    if (!mtfResult) return tradingData.maSummary;
    
    const buyCount = mtfResult.timeframes.filter(t => t.direction === 'BUY').length;
    const sellCount = mtfResult.timeframes.filter(t => t.direction === 'SELL').length;
    const neutralCount = mtfResult.timeframes.filter(t => t.direction === 'NEUTRAL').length;
    const score = Math.round((buyCount / mtfResult.timeframes.length) * 100);
    
    return {
      buyCount,
      neutralCount,
      sellCount,
      score,
      verdict: score >= 66 ? 'BUY' : score <= 33 ? 'SELL' : 'NEUTRAL' as IndicatorSummary['verdict'],
    };
  }, [marketContext.structure, mtfResult, tradingData.maSummary]);

  // Zone intelligence from market context engine
  const zoneIntelligence = useMemo(() => {
    if (!marketContext.isInitialized || !marketContext.decision) {
      return {
        zone: null,
        isInsideZone: false,
        isApproachingZone: false,
        distanceToZone: 0,
      };
    }
    
    const primaryZone = marketContext.decision.primaryZone;
    const price = tradingData.price;
    
    if (!primaryZone) {
      return {
        zone: null,
        isInsideZone: false,
        isApproachingZone: false,
        distanceToZone: 0,
      };
    }
    
    // Handle both ManualDailyZone and InstitutionalZone/ZoneCluster
    const zoneMin = 'zoneMin' in primaryZone ? primaryZone.zoneMin : primaryZone.priceMin;
    const zoneMax = 'zoneMax' in primaryZone ? primaryZone.zoneMax : primaryZone.priceMax;
    const midpoint = 'midpoint' in primaryZone ? primaryZone.midpoint : (zoneMin + zoneMax) / 2;
    
    const isInsideZone = price >= zoneMin && price <= zoneMax;
    const distanceToZone = isInsideZone 
      ? 0 
      : Math.min(
          Math.abs(price - zoneMin),
          Math.abs(price - zoneMax)
        );
    const isApproachingZone = !isInsideZone && distanceToZone <= 50; // 50 points threshold
    
    return {
      zone: primaryZone,
      isInsideZone,
      isApproachingZone,
      distanceToZone,
    };
  }, [marketContext.isInitialized, marketContext.decision, tradingData.price]);

  // Session intelligence from macro context
  const sessionIntelligence = useMemo(() => {
    if (!macroContext) {
      return {
        currentSession: 'CLOSED' as const,
        isSessionActive: false,
        madridTime: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        newYorkTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
    }
    
    // Map macro session to our format
    const sessionMap: Record<MacroContext['session']['current'], 'GOLD' | 'US500' | 'CLOSED'> = {
      ASIA: 'GOLD',
      LONDON: 'US500',
      NEW_YORK: 'US500',
      OVERLAP_LN: 'US500',
      OVERLAP_NY: 'US500',
      CLOSED: 'CLOSED'
    };
    
    const currentSession = sessionMap[macroContext.session.current] || 'CLOSED';
    const isSessionActive = macroContext.session.current !== 'CLOSED';
    
    return {
      currentSession,
      isSessionActive,
      madridTime: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      newYorkTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  }, [macroContext]);

  // Buy/Sell support from market context engine
  const buySupport = marketContext.uiSummary?.buyCount ?? 50;
  const sellSupport = marketContext.uiSummary?.sellCount ?? 50;
  
  // State from market context engine
  const state = marketContext.uiSummary?.state ?? 'NO SIGNAL';

  // Evidence groups from market context engine (confluence factors)
  const evidenceGroups = useMemo(() => {
    if (!marketContext.isInitialized || !marketContext.decision || !marketContext.decision.confluence) {
      // Return placeholder groups if no data
      return {
        location: {
          direction: 'BUY',
          strength: 80,
          confidence: 90,
          features: ['Price inside zone', 'Zone tested 3 times'],
          contradictions: [],
          freshness: 'LIVE'
        },
        structure: {
          direction: 'BUY',
          strength: 60,
          confidence: 70,
          features: ['Higher highs', 'Higher lows'],
          contradictions: [],
          freshness: 'LIVE'
        },
        volume: {
          direction: 'BUY',
          strength: 70,
          confidence: 80,
          features: ['High relative volume', 'Volume expansion'],
          contradictions: [],
          freshness: 'LIVE'
        },
        orderFlow: {
          direction: 'BUY',
          strength: 75,
          confidence: 85,
          features: ['Strong positive delta', 'Absorption detected'],
          contradictions: [],
          freshness: 'LIVE'
        },
        liquidity: {
          direction: 'NEUTRAL',
          strength: 50,
          confidence: 60,
          features: [],
          contradictions: [],
          freshness: 'LIVE'
        },
        microstructure: {
          direction: 'BUY',
          strength: 65,
          confidence: 75,
          features: ['Low spread', 'High trade frequency'],
          contradictions: [],
          freshness: 'LIVE'
        },
        macro: {
          direction: 'BUY',
          strength: 70,
          confidence: 80,
          features: ['No high-impact events', 'DXY weakening'],
          contradictions: [],
          freshness: 'LIVE'
        },
        crossMarket: {
          direction: 'BUY',
          strength: 65,
          confidence: 70,
          features: ['Gold/Silver alignment', 'ES/NQ confirmation'],
          contradictions: [],
          freshness: 'LIVE'
        },
        volatility: {
          direction: 'NEUTRAL',
          strength: 50,
          confidence: 65,
          features: ['Normal volatility'],
          contradictions: [],
          freshness: 'LIVE'
        },
        momentum: {
          direction: 'BUY',
          strength: 60,
          confidence: 70,
          features: ['Positive price acceleration'],
          contradictions: [],
          freshness: 'LIVE'
        }
      };
    }
    
    // Map confluence factors to evidence groups
    const factors = marketContext.decision.confluence.factors;
    const groupMap: Record<string, any> = {};
    
    // Define mapping from factor names to evidence group keys
    const factorToGroup: Record<string, string> = {
      MANUAL_ZONE: 'location',
      ZONE_CLUSTER: 'structure',
      MARKET_STRUCTURE: 'structure',
      BOS: 'structure',
      ORDER_FLOW: 'orderFlow',
      TAPE: 'microstructure',
      INST_PRESSURE: 'liquidity',
      EMA_CLOUD: 'momentum',
      OSCILLATORS: 'momentum',
      VOLUME: 'volume',
      VOLUME_DELTA: 'volume',
      BOOK_IMBALANCE: 'liquidity',
      RSI: 'oscillators',
      MACD: 'oscillators',
      MOMENTUM: 'momentum'
    };
    
    // Initialize groups
    const groups = [
      'location', 'structure', 'volume', 'orderFlow', 'liquidity', 
      'microstructure', 'macro', 'crossMarket', 'volatility', 'momentum', 'oscillators'
    ];
    
    groups.forEach(key => {
      groupMap[key] = {
        direction: 'NEUTRAL',
        strength: 50,
        confidence: 50,
        features: [],
        contradictions: [],
        freshness: 'LIVE'
      };
    });
    
    // Process factors
    factors.forEach(factor => {
      const groupKey = factorToGroup[factor.name] || 'momentum';
      const group = groupMap[groupKey];
      
      // Update direction based on factor action
      if (factor.action === 'BUY') {
        group.direction = 'BUY';
      } else if (factor.action === 'SELL') {
        group.direction = 'SELL';
      } else {
        group.direction = 'NEUTRAL';
      }
      
      // Update strength (0-100) based on weight
      group.strength = Math.min(100, Math.max(0, factor.weight * 2)); // Scale weight to 0-100
      
      // Update confidence based on whether it's correlated (more reliable)
      group.confidence = factor.isCorrelated ? 85 : 70;
      
      // Add feature
      group.features = [...group.features, factor.value.toString()];
      
      // Add to contradictions if it's a contradiction factor
      if (marketContext.decision.confluence.contradictions.includes(factor)) {
        group.contradictions = [...group.contradictions, factor.name];
      }
    });
    
    // Add macro-specific groups from macro context
    if (macroContext) {
      // Macro group
      groupMap.macro = {
        direction: macroContext.bias.includes('BULLISH') ? 'BUY' : macroContext.bias.includes('BEARISH') ? 'SELL' : 'NEUTRAL',
        strength: Math.min(100, Math.max(0, 50 + Math.abs(macroContext.score))),
        confidence: 80,
        features: [
          `Session: ${macroContext.session.current}`,
          macroContext.upcomingHighImpact.length > 0 
            ? `${macroContext.upcomingHighImpact.length} high-impact events upcoming` 
            : 'No high-impact events',
          `DXY: ${macroContext.dxyTrend}`,
          `Yields: ${macroContext.yieldsTrend}`
        ],
        contradictions: [],
        freshness: macroContext.quietZoneActive ? 'STALE' : 'LIVE'
      };
      
      // CrossMarket group (inter-market)
      groupMap.crossMarket = {
        direction: macroContext.riskRegime === 'RISK_ON' ? 'BUY' : macroContext.riskRegime === 'RISK_OFF' ? 'SELL' : 'NEUTRAL',
        strength: 70,
        confidence: 75,
        features: [
          `Risk regime: ${macroContext.riskRegime}`,
          `DXY trend: ${macroContext.dxyTrend}`,
          `Yields trend: ${macroContext.yieldsTrend}`
        ],
        contradictions: [],
        freshness: 'LIVE'
      };
    }
    
    return groupMap;
  }, [marketContext.isInitialized, marketContext.decision, macroContext]);

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        
        <div className="flex items-center space-x-4">
          {SUPPORTED_ASSETS.map(asset => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset.symbol)}
              className={cn(
                "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all",
                selectedAsset === asset.symbol
                  ? "bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]"
                  : "bg-white/[0.02] text-white/60 hover:text-white border border-white/[0.04] hover:bg-white/[0.03]"
              )}
            >
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                {displayNameMap[asset.symbol] || asset.symbol}
              </span>
            </button>
          ))}
        </div>

      </header>

      <main className="flex-grow p-8 max-w-[1600px] w-full mx-auto flex flex-col space-y-8">
        
        <AssetSummaryCard
          data={tradingData}
          precision={activeConfig.precision}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-5 flex flex-col">
            <TradingViewGauge
              overallSummary={overallComposite}
              oscillatorsSummary={tradingData.oscillatorsSummary}
              maSummary={tradingData.maSummary}
              orderFlowSummary={tradingData.orderFlowSummary}
              mtfSummary={mtfSummary}
              selectedAsset={selectedAsset}
              sessionIntelligence={sessionIntelligence}
              zoneIntelligence={zoneIntelligence}
              buySupport={buySupport}
              sellSupport={sellSupport}
              state={state}
              evidenceGroups={evidenceGroups}
              isLoading={tradingData.isLoading || !marketContext.isInitialized}
            />
          </div>

          <div className="lg:col-span-7 flex flex-col">
            <TechnicalDetailsTable
              oscillators={tradingData.oscillators}
              movingAverages={tradingData.movingAverages}
              orderFlowIndicators={tradingData.orderFlowIndicators}
              isLoading={tradingData.isLoading}
            />
          </div>

        </div>

        <RealtimeOrderFlow
          data={tradingData}
          precision={activeConfig.precision}
        />

      </main>
      
      {/* Fundamental Intelligence Panel */}
      <div className="bg-[#0b0c10] border-t border-white/[0.04] px-8 py-6">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Economic Calendar */}
          <div className="bg-[#07080a] rounded-2xl border border-white/[0.06] p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
              Economic Calendar
            </h3>
            <div className="space-y-2">
              {fundamentalIntelligence.todayEvents.slice(0, 3).map(event => (
                <div key={event.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <span className="w-2 h-2 
                      {event.impact === 'HIGH' ? 'bg-red-500' : 
                       event.impact === 'MEDIUM' ? 'bg-amber-400' : 
                       'bg-green-400'} rounded mr-2"></span>
                    <span>{event.name}</span>
                  </div>
                  <span className="text-amber-400 font-mono">
                    {event.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              ))}
              {fundamentalIntelligence.upcomingHighImpact && (
                <div className="pt-3 border-t border-white/[0.04]">
                  <span className="text-xs text-white/50">Next High Impact:</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-white">{fundamentalIntelligence.upcomingHighImpact.name}</span>
                    <span className="text-amber-400 font-mono">
                      {fundamentalIntelligence.upcomingHighImpact.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Session Intelligence */}
          <div className="bg-[#07080a] rounded-2xl border border-white/[0.06] p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
              Session Intelligence
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Current Session:</span>
                <span className="font-mono 
                  {fundamentalIntelligence.currentSession.killZone ? 'text-amber-400' : 'text-white'}"
                >{fundamentalIntelligence.currentSession.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Volatility:</span>
                <span className="font-mono 
                  {fundamentalIntelligence.goldVolatility === 'EXTREME' ? 'text-red-500' : 
                   fundamentalIntelligence.goldVolatility === 'HIGH' ? 'text-amber-400' : 
                   fundamentalIntelligence.goldVolatility === 'NORMAL' ? 'text-white' : 
                   'text-green-400'}"
                >{fundamentalIntelligence.goldVolatility}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Next Session:</span>
                <span className="font-mono text-white/60">
                  {fundamentalIntelligence.nextSession?.name || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Time Until:</span>
                <span className="font-mono text-white/60">
                  {fundamentalIntelligence.minutesUntilNext} min
                </span>
              </div>
              {fundamentalIntelligence.quietZoneActive && (
                <div className="mt-2 p-2 bg-red-900/30 rounded text-red-400 text-sm">
                  ⚠ Quiet Zone Active - Reduced Volatility Expected
                </div>
              )}
            </div>
          </div>
          
          {/* Cross-Market Analysis */}
          <div className="bg-[#07080a] rounded-2xl border border-white/[0.06] p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
              Cross-Market Analysis
            </h3>
            <div className="space-y-2">
              {fundamentalIntelligence.crossMarketAssets.map(asset => (
                <div key={asset.symbol} className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <span className="w-2 h-2 
                      {asset.correlation === 'POSITIVE' ? 'bg-green-400' : 
                       asset.correlation === 'NEGATIVE' ? 'bg-red-500' : 
                       'bg-amber-400'} rounded mr-2"></span>
                    <span>{asset.symbol}</span>
                  </div>
                  <span className="font-mono text-white/90">
                    {asset.price.toFixed(2)} 
                    {asset.change >= 0 ? '+' : ''}{asset.change.toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="mt-3 pt-2 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Gold/DXY Correlation:</span>
                  <span className="font-mono 
                    {fundamentalIntelligence.goldDxyCorrelation < -0.5 ? 'text-green-400' : 
                     fundamentalIntelligence.goldDxyCorrelation > 0.5 ? 'text-red-500' : 
                     'text-amber-400'}"
                  >{fundamentalIntelligence.goldDxyCorrelation.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/50 mt-1">
                  <span>Gold/Yields Correlation:</span>
                  <span className="font-mono 
                    {fundamentalIntelligence.goldYieldsCorrelation < -0.5 ? 'text-green-400' : 
                     fundamentalIntelligence.goldYieldsCorrelation > 0.5 ? 'text-red-500' : 
                     'text-amber-400'}"
                  >{fundamentalIntelligence.goldYieldsCorrelation.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Monetary Policy & Risk Sentiment */}
          <div className="bg-[#07080a] rounded-2xl border border-white/[0.06] p-4">
            <h3 className="text-white font-bold mb-3 flex items-center">
              <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
              Monetary Policy & Risk
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Fed Bias:</span>
                <span className="font-mono 
                  {fundamentalIntelligence.monetaryPolicy.fedBias === 'DOVISH' ? 'text-green-400' : 
                   fundamentalIntelligence.monetaryPolicy.fedBias === 'HAWKISH' ? 'text-red-500' : 
                   'text-amber-400'}"
                >{fundamentalIntelligence.monetaryPolicy.fedBias}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>DXY:</span>
                <span className="font-mono text-white/90">
                  {fundamentalIntelligence.monetaryPolicy.dxyIndex.toFixed(2)} 
                  {fundamentalIntelligence.monetaryPolicy.dxyChange >= 0 ? '+' : ''}{fundamentalIntelligence.monetaryPolicy.dxyChange.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>10Y Yield:</span>
                <span className="font-mono text-white/90">
                  {fundamentalIntelligence.monetaryPolicy.yield10Y.toFixed(2)}% 
                  {fundamentalIntelligence.monetaryPolicy.yieldChange >= 0 ? '+' : ''}{fundamentalIntelligence.monetaryPolicy.yieldChange.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Risk Sentiment:</span>
                <span className="font-mono 
                  {fundamentalIntelligence.riskSentiment === 'RISK_ON' ? 'text-green-400' : 
                   fundamentalIntelligence.riskSentiment === 'RISK_OFF' ? 'text-red-500' : 
                   'text-amber-400'}"
                >{fundamentalIntelligence.riskSentiment}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>VIX:</span>
                <span className="font-mono text-white/90">
                  {fundamentalIntelligence.vixLevel.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
          
        </div>
        
        {/* Fundamental Bias & Position Sizing */}
        <div className="mt-4 bg-[#07080a] rounded-2xl border border-white/[0.06] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold flex items-center">
                <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
                Fundamental Bias
              </h3>
              <p className="mt-2 text-white/80 text-sm">
                {fundamentalBias.reasons.join(' • ')}
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black 
                {fundamentalBias.bias === 'BULLISH' ? 'text-green-400' : 
                 fundamentalBias.bias === 'BEARISH' ? 'text-red-500' : 
                 'text-amber-400'}"
              >
                {fundamentalBias.bias === 'BULLISH' ? '▲' : fundamentalBias.bias === 'BEARISH' ? '▼' : '◆'}
              </div>
              <div className="text-white font-bold mt-2">
                Strength: {fundamentalBias.strength}%
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <h3 className="text-white font-bold mb-2 flex items-center">
              <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
              Position Sizing Recommendation
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-white/50">Max Risk:</span>
                <span className="font-mono text-white">{positionSizing.maxRisk}%</span>
              </div>
              <div>
                <span className="text-white/50">Recommended Size:</span>
                <span className="font-mono text-white">{positionSizing.recommendedSize} lots</span>
              </div>
            </div>
            <div className="mt-3 text-white/60 text-sm">
              Reasoning: {positionSizing.reasoning.join(' • ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;