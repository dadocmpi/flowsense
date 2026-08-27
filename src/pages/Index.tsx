import React, { useState, useEffect } from 'react';
import { useTwelveData } from '../hooks/useTwelveData';
import { TradingViewGauge } from '../components/trading/TradingViewGauge';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { SUPPORTED_ASSETS } from '../types/trading';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Button,
} from '@/components/ui/button';
import {
  Input,
} from '@/components/ui/input';
import {
  Label,
} from '@/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Separator,
} from '@/components/ui/separator';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('XAU/USD');
  const twelveData = useTwelveData(selectedAsset);

  // Find config for selected asset
  const activeConfig = SUPPORTED_ASSETS.find(asset => asset.symbol === selectedAsset) || SUPPORTED_ASSETS[0];

  // Config state per asset
  const [config, setConfig] = useState({
    direction: 'BUY' as 'BUY' | 'SELL',
    startTime: '09:00',
    endTime: '11:30',
    minPrice: 0,
    maxPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  // Load config from localStorage for the selected asset
  useEffect(() => {
    const saved = localStorage.getItem(`tradingConfig_${selectedAsset}`);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse config', e);
      }
    } else {
      // Set defaults based on asset
      if (selectedAsset === 'XAU/USD') {
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
      } else {
        setConfig({
          direction: 'BUY',
          startTime: '09:00',
          endTime: '11:30',
          minPrice: 0,
          maxPrice: 0,
          stopLoss: 0,
          takeProfit: 0,
        });
      }
    }
  }, [selectedAsset]);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(`tradingConfig_${selectedAsset}`, JSON.stringify(config));
  }, [selectedAsset, config]);

  const handleSave = () => {
    setDialogOpen(false);
    // Already saved via useEffect
  };

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      
      {/* Header Bar */}
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        
        {/* Asset Selection */}
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
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">{asset.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Market Status Button (also opens config dialog) */}
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-full hover:bg-white/[0.03] transition-colors">
              <span className={`w-2 h-2 rounded-full ${twelveData.isMarketOpen ? 'bg-[#26a69a] animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-bold text-white/60">
                {twelveData.isMarketOpen ? 'TRADING ZONE' : 'CLOSED'}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="w-[400px] bg-[#0b0c10] border border-white/[0.08] rounded-3xl p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)]">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-black text-white">Trading Zone Configuration</DialogTitle>
              <DialogDescription className="mt-2 text-white/60 text-sm">
                Set your trading parameters for {activeConfig.name}
              </DialogDescription>
            </DialogHeader>
            <Separator className="my-4" />
            <div className="space-y-4">
              {/* Direction */}
              <div className="space-y-2">
                <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Direction</Label>
                <RadioGroup
                  value={config.direction}
                  onValueChange={setConfig as any}
                  className="flex items-center space-x-4"
                >
                  <RadioGroupItem value="BUY">
                    <span className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#26a69a]" />
                      <span className="text-white/90 text-[9px] font-medium">BUY (Long)</span>
                    </span>
                  </RadioGroupItem>
                  <RadioGroupItem value="SELL">
                    <span className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ef5350]" />
                      <span className="text-white/90 text-[9px] font-medium">SELL (Short)</span>
                    </span>
                  </RadioGroupItem>
                </RadioGroup>
              </div>

              {/* Time Window */}
              <div className="space-y-2">
                <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Trading Hours (Local)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white/60 text-[8px] block">Start</Label>
                    <Input
                      type="time"
                      value={config.startTime}
                      onChange={e => setConfig(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white/60 text-[8px] block">End</Label>
                    <Input
                      type="time"
                      value={config.endTime}
                      onChange={e => setConfig(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Price Zone */}
              <div className="space-y-2">
                <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Institutional Price Zone</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white/60 text-[8px] block">Min Price ($)</Label>
                    <Input
                      type="number"
                      value={config.minPrice}
                      onChange={e => setConfig(prev => ({ ...prev, minPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white/60 text-[8px] block">Max Price ($)</Label>
                    <Input
                      type="number"
                      value={config.maxPrice}
                      onChange={e => setConfig(prev => ({ ...prev, maxPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Stop Loss & Take Profit */}
              <div className="space-y-2">
                <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Risk Management</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white/60 text-[8px] block">Stop Loss ($)</Label>
                    <Input
                      type="number"
                      value={config.stopLoss}
                      onChange={e => setConfig(prev => ({ ...prev, stopLoss: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white/60 text-[8px] block">Take Profit ($)</Label>
                    <Input
                      type="number"
                      value={config.takeProfit}
                      onChange={e => setConfig(prev => ({ ...prev, takeProfit: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-white/60 hover:text-white">
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:bg-gradient-to-r from-amber-400 to-amber-300">
                Save Configuration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

// Helper function for class names (copy from utils)
function cn(...inputs: string[]) {
  return inputs.filter(Boolean).join(' ');
}

export default Index;