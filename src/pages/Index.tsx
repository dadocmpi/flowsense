import React, { useState, useEffect, useMemo } from 'react';
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