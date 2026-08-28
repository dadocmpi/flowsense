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
  const twelveData = useRefinedTradingData(selectedAsset);

  const activeConfig = SUPPORTED_ASSETS.find(asset => asset.symbol === selectedAsset) || SUPPORTED_ASSETS[0];
  const binanceSymbol = activeConfig.binanceSymbol || 'PAXGUSDT';

  const displayNameMap: Record<string, string> = {
    'MGC1!': 'GOLD',
    'ES1!': 'SP500'
  };

  // Multi-timeframe engine (Layer 2)
  const mtfResult = useMultiTimeframe(binanceSymbol, twelveData.price);

  // Build a true OVERALL composite that factors in EVERY layer
  const overallComposite: IndicatorSummary = useMemo(() => {
    if (!mtfResult) return twelveData.overallSummary;
    
    // Convert MTF weightedScore (-100..+100) to 0..100 summary
    const mtfSummary: IndicatorSummary = {
      buyCount: mtfResult.timeframes.filter(t => t.direction === 'BUY').length,
      sellCount: mtfResult.timeframes.filter(t => t.direction === 'SELL').length,
      neutralCount: mtfResult.timeframes.filter(t => t.direction === 'NEUTRAL').length,
      score: Math.round((mtfResult.weightedScore + 100) / 2),
      verdict: mtfResult.weightedScore > 15 ? 'BUY' : 
               mtfResult.weightedScore < -15 ? 'SELL' : 'NEUTRAL',
    };
    
    return buildOverallComposite(
      twelveData.oscillatorsSummary,
      twelveData.maSummary,
      twelveData.orderFlowSummary,
      mtfSummary
    );
  }, [twelveData, mtfResult]);

  const [config, setConfig] = useState({
    direction: 'BUY' as 'BUY' | 'SELL',
    startTime: '09:00',
    endTime: '11:30',
    minPrice: 0,
    maxPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
  });

  useEffect(() => {
    const saved = localStorage.getItem(`tradingConfig_${selectedAsset}`);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse config', e);
      }
    } else {
      if (selectedAsset === 'MGC1!') {
        setConfig({
          direction: 'BUY',
          startTime: '09:00',
          endTime: '11:30',
          minPrice: 2900,
          maxPrice: 3000,
          stopLoss: 2850,
          takeProfit: 3050,
        });
      } else if (selectedAsset === 'ES1!') {
        setConfig({
          direction: 'BUY',
          startTime: '09:30',
          endTime: '11:30',
          minPrice: 5000,
          maxPrice: 5200,
          stopLoss: 4950,
          takeProfit: 5250,
        });
      }
    }
  }, [selectedAsset]);

  useEffect(() => {
    localStorage.setItem(`tradingConfig_${selectedAsset}`, JSON.stringify(config));
  }, [selectedAsset, config]);

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
          data={twelveData}
          precision={activeConfig.precision}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-5 flex flex-col">
            <TradingViewGauge
              overallSummary={overallComposite}
              oscillatorsSummary={twelveData.oscillatorsSummary}
              maSummary={twelveData.maSummary}
              orderFlowSummary={twelveData.orderFlowSummary}
              mtfSummary={overallComposite}
              selectedAsset={selectedAsset}
            />
          </div>

          <div className="lg:col-span-7 flex flex-col">
            <TechnicalDetailsTable
              oscillators={twelveData.oscillators}
              movingAverages={twelveData.movingAverages}
              orderFlowIndicators={twelveData.orderFlowIndicators}
            />
          </div>

        </div>

        <RealtimeOrderFlow
          data={twelveData}
          precision={activeConfig.precision}
        />

      </main>
    </div>
  );
};

export default Index;