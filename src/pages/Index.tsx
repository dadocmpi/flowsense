import React, { useState, useMemo } from 'react';
import { useRefinedTradingData } from '../hooks/useRefinedTradingData';
import { useMultiTimeframe } from '../hooks/useMultiTimeframe';
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

  // True OVERALL composite
  const overallComposite: IndicatorSummary = useMemo(() => {
    if (!mtfResult) return tradingData.overallSummary;
    
    const mtfSummary: IndicatorSummary = {
      buyCount: mtfResult.timeframes.filter(t => t.direction === 'BUY').length,
      sellCount: mtfResult.timeframes.filter(t => t.direction === 'SELL').length,
      neutralCount: mtfResult.timeframes.filter(t => t.direction === 'NEUTRAL').length,
      score: Math.round((mtfResult.weightedScore + 100) / 2),
      verdict: mtfResult.weightedScore > 15 ? 'BUY' : 
               mtfResult.weightedScore < -15 ? 'SELL' : 'NEUTRAL',
    };
    
    return buildOverallComposite(
      tradingData.oscillatorsSummary,
      tradingData.maSummary,
      tradingData.orderFlowSummary,
      mtfSummary
    );
  }, [tradingData, mtfResult]);

  // For now, we'll use placeholder values for buySupport, sellSupport, and state
  // In a full implementation, these would come from a useConfluenceEngine hook
  const buySupport = Math.max(0, Math.min(100, overallComposite.score));
  const sellSupport = 100 - buySupport;
  const state = overallComposite.score >= 75 ? 'BUY CONDITIONS FAVORED' :
                overallComposite.score >= 55 ? 'BUY CONDITIONS DEVELOPING' :
                overallComposite.score <= 25 ? 'SELL CONDITIONS FAVORED' :
                overallComposite.score <= 45 ? 'SELL CONDITIONS DEVELOPING' :
                'NO SIGNAL';

  // Placeholder evidence groups (would be calculated by useConfluenceEngine)
  const evidenceGroups = {
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
              mtfSummary={overallComposite}
              selectedAsset={selectedAsset}
              sessionIntelligence={tradingData.sessionIntelligence}
              zoneIntelligence={tradingData.zoneIntelligence}
              buySupport={buySupport}
              sellSupport={sellSupport}
              state={state}
              evidenceGroups={evidenceGroups}
              isLoading={tradingData.isLoading}
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
    </div>
  );
};

export default Index;