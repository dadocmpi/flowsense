import React, { useState } from 'react';
import { useTwelveData } from '../hooks/useTwelveData';
import { TradingViewGauge } from '../components/trading/TradingViewGauge';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { SUPPORTED_ASSETS } from '../types/trading';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('XAU/USD');
  const twelveData = useTwelveData(selectedAsset);

  // Find config for selected asset
  const activeConfig = SUPPORTED_ASSETS.find(asset => asset.symbol === selectedAsset) || SUPPORTED_ASSETS[0];

  // Toggle between assets
  const toggleAsset = () => {
    const currentIndex = SUPPORTED_ASSETS.findIndex(a => a.symbol === selectedAsset);
    const nextIndex = (currentIndex + 1) % SUPPORTED_ASSETS.length;
    setSelectedAsset(SUPPORTED_ASSETS[nextIndex].symbol);
  };

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      
      {/* Header Bar */}
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        
        {/* Asset Badge */}
        <div className="flex items-center space-x-3">
          <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">COMMODITY:</span>
          <div className="px-5 py-2 rounded-2xl text-xs font-black tracking-wider bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]">
            {activeConfig.name}
          </div>
        </div>

        {/* Market Status Button (also toggles asset) */}
        <button 
          onClick={toggleAsset}
          className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-full hover:bg-white/[0.03] transition-colors"
        >
          <span className={`w-2 h-2 rounded-full ${twelveData.isMarketOpen ? 'bg-[#26a69a] animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-[10px] font-bold text-white/60">
            {twelveData.isMarketOpen ? 'TRADING ZONE' : 'CLOSED'}
          </span>
        </button>
      </header>

      {/* Main Terminal Content */}
      <main className="flex-grow p-8 max-w-[1600px] w-full mx-auto flex flex-col space-y-8">
        
        {/* Highlight Asset Summary Card */}
        <AssetSummaryCard
          data={twelveData}
          precision={activeConfig.precision}
        />

        {/* Main Grid: Compass + Technical Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Column 1: Confluence Compass (5/12 cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <TradingViewGauge
              overallSummary={twelveData.overallSummary}
              oscillatorsSummary={twelveData.oscillatorsSummary}
              maSummary={twelveData.maSummary}
              orderFlowSummary={twelveData.orderFlowSummary}
              selectedAsset={selectedAsset}
            />
          </div>

          {/* Column 2: Detailed Technical Indicators (7/12 cols) */}
          <div className="lg:col-span-7 flex flex-col">
            <TechnicalDetailsTable
              oscillators={twelveData.oscillators}
              movingAverages={twelveData.movingAverages}
              orderFlowIndicators={twelveData.orderFlowIndicators}
            />
          </div>

        </div>

        {/* Lower Section: REAL-TIME ORDER FLOW */}
        <RealtimeOrderFlow
          data={twelveData}
          precision={activeConfig.precision}
        />

      </main>
    </div>
  );
};

export default Index;