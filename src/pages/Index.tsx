import React, { useState, useEffect, useMemo } from 'react';
import { useBinanceFeed } from '../hooks/useBinanceFeed';
import { useCandleHistory } from '../hooks/useCandleHistory';
import { useMarketContext } from '../hooks/useMarketContext';
import { ContextEngineView } from '../components/trading/ContextEngineView';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { RealOrderBook } from '../components/trading/RealOrderBook';
import { LiveTradeFeed } from '../components/trading/LiveTradeFeed';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { TwelveDataState, TradeFeedItem, SUPPORTED_ASSETS, IndicatorSignal, IndicatorSummary } from '../types/trading';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { TradingViewGauge } from '../components/trading/TradingViewGauge';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('MGC1!');
  const activeConfig = SUPPORTED_ASSETS.find(asset => asset.symbol === selectedAsset) || SUPPORTED_ASSETS[0];
  const binanceSymbol = activeConfig.binanceSymbol;

  // Real market data
  const feed = useBinanceFeed(binanceSymbol);
  const candleHistory = useCandleHistory(binanceSymbol, '1m', 200);

  // Build context via the engine
  const context = useMarketContext({
    symbol: selectedAsset,
    currentPrice: feed.ticker?.price ?? 0,
    candles: candleHistory.candles,
    orderBookImbalance: feed.hasOrderBook ? feed.orderBookImbalance : null,
    volumeDelta: feed.hasTape ? feed.volumeDelta : null,
    buyerDominance: feed.hasTape ? feed.buyerDominance : null,
    hasOrderBook: feed.hasOrderBook,
    hasTape: feed.hasTape,
    tapeTradeCount: feed.recentTrades.length,
    orderBookLevels: feed.bids.length + feed.asks.length,
    lastTickerUpdate: feed.lastTickerUpdate,
    lastTapeUpdate: feed.lastTapeUpdate,
    lastDepthUpdate: feed.lastDepthUpdate,
  });

  // Adapter: map feed to TwelveDataState for legacy components (RealtimeOrderFlow, TradingViewGauge)
  const twelveDataLike = useMemo<TwelveDataState | null>(() => {
    if (!feed.ticker || !context) return null;
    const t = feed.ticker;
    return {
      symbol: selectedAsset,
      price: t.price,
      change: t.change,
      percentChange: t.percentChange,
      high: t.high,
      low: t.low,
      open: t.open,
      previousClose: t.open,
      datetime: new Date(t.timestamp).toLocaleTimeString(),
      isLive: feed.isConnected,
      isMarketOpen: feed.isConnected,
      oscillators: context.positiveFactors.concat(context.negativeFactors).concat(context.neutralFactors).filter(f =>
        ['RSI', 'MACD', 'MOMENTUM'].includes(f.category)
      ).map(f => ({
        name: f.label,
        value: f.description || '',
        action: f.polarity === 'POSITIVE' ? 'BUY' : f.polarity === 'NEGATIVE' ? 'SELL' : 'NEUTRAL',
      })) as IndicatorSignal[],
      movingAverages: [
        { name: 'EMA Stack', value: context.factors ? '' : '', action: context.directionalBias === 'BULLISH' ? 'BUY' : context.directionalBias === 'BEARISH' ? 'SELL' : 'NEUTRAL' },
        { name: 'EMA 200 Bias', value: '', action: context.factors && context.negativeFactors.some(f => f.id === 'ema-stack' && f.polarity === 'NEGATIVE') ? 'SELL' : 'BUY' },
      ] as IndicatorSignal[],
      orderFlowIndicators: context.positiveFactors.concat(context.negativeFactors).filter(f =>
        ['ORDER_FLOW', 'ORDER_BOOK', 'VOLUME'].includes(f.category)
      ).map(f => ({
        name: f.label,
        value: f.description || '',
        action: f.polarity === 'POSITIVE' ? 'BUY' : f.polarity === 'NEGATIVE' ? 'SELL' : 'NEUTRAL',
      })) as IndicatorSignal[],
      buyersPercent: Math.round(feed.buyerDominance * 100),
      sellersPercent: Math.round((1 - feed.buyerDominance) * 100),
      volumeDelta: feed.volumeDelta,
      institutionalPressure: Math.abs(feed.volumeDelta) > 50 ? 'EXTREME' : Math.abs(feed.volumeDelta) > 20 ? 'HIGH' : Math.abs(feed.volumeDelta) > 5 ? 'MEDIUM' : 'LOW',
      bids: feed.bids.map(b => ({ price: b.price, size: b.size, cumulativeSize: b.size, percentage: b.percentage })),
      asks: feed.asks.map(a => ({ price: a.price, size: a.size, cumulativeSize: a.size, percentage: a.percentage })),
      recentTrades: feed.recentTrades.map(t => ({
        id: t.id,
        price: t.price,
        size: t.size,
        time: t.time,
        type: t.isBuyerMaker ? 'SELL' : 'BUY',
        aggressor: t.isBuyerMaker ? 'SELL_AGGR' : 'BUY_AGGR',
      })) as TradeFeedItem[],
      overallSummary: {
        buyCount: context.positiveFactors.reduce((s, f) => s + Math.abs(f.weight), 0),
        neutralCount: context.neutralFactors.length,
        sellCount: context.negativeFactors.reduce((s, f) => s + Math.abs(f.weight), 0),
        score: Math.abs(context.contextScore),
        verdict: context.directionalBias === 'BULLISH' ? (context.contextScore > 30 ? 'STRONG BUY' : 'BUY') :
                 context.directionalBias === 'BEARISH' ? (context.contextScore < -30 ? 'STRONG SELL' : 'SELL') : 'NEUTRAL',
      },
      oscillatorsSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
      maSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
      orderFlowSummary: { buyCount: 0, neutralCount: 0, sellCount: 0, score: 50, verdict: 'NEUTRAL' },
    };
  }, [feed, context, selectedAsset]);

  // Config state
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
      try { setConfig(JSON.parse(saved)); } catch (e) { console.error(e); }
    } else if (selectedAsset === 'MGC1!') {
      setConfig({ direction: 'BUY', startTime: '09:00', endTime: '11:30', minPrice: 2900, maxPrice: 3000, stopLoss: 2850, takeProfit: 3050 });
    } else {
      setConfig({ direction: 'BUY', startTime: '09:30', endTime: '11:30', minPrice: 5000, maxPrice: 5200, stopLoss: 4950, takeProfit: 5250 });
    }
  }, [selectedAsset]);

  useEffect(() => {
    localStorage.setItem(`tradingConfig_${selectedAsset}`, JSON.stringify(config));
  }, [selectedAsset, config]);

  const displayNameMap: Record<string, string> = { 'MGC1!': 'GOLD', 'ES1!': 'SP500' };

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

        <div className="flex items-center space-x-3">
          {/* Connection status */}
          <div className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-full">
            <span className={cn("w-2 h-2 rounded-full", feed.isConnected ? 'bg-[#26a69a] animate-pulse' : 'bg-[#ef5350]')} />
            <span className="text-[10px] font-bold text-white/60">
              {feed.isConnected ? 'LIVE FEED' : 'RECONNECTING'}
            </span>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <button className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-full hover:bg-white/[0.03] transition-colors">
                <span className={cn("w-2 h-2 rounded-full", context?.state === 'HIGH_CONFLUENCE' ? 'bg-[#26a69a]' : 'bg-amber-400')} />
                <span className="text-[10px] font-bold text-white/60">
                  {context?.state?.replace(/_/g, ' ') || 'INITIALIZING'}
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="w-[400px] bg-[#0b0c10] border border-white/[0.08] rounded-3xl p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)]">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-black text-white">Trading Zone Configuration</DialogTitle>
                <DialogDescription className="mt-2 text-white/60 text-sm">
                  Set your trading parameters for {displayNameMap[selectedAsset] || selectedAsset}
                </DialogDescription>
              </DialogHeader>
              <Separator className="my-4" />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Direction</Label>
                  <RadioGroup value={config.direction} onValueChange={(v: any) => setConfig(prev => ({ ...prev, direction: v }))} className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="BUY" id="buy" />
                      <Label htmlFor="buy" className="text-white/90 text-[10px]">BUY (Long)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="SELL" id="sell" />
                      <Label htmlFor="sell" className="text-white/90 text-[10px]">SELL (Short)</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Trading Hours</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-white/60 text-[8px] block">Start</Label>
                      <Input type="time" value={config.startTime} onChange={e => setConfig(prev => ({ ...prev, startTime: e.target.value }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                    </div>
                    <div>
                      <Label className="text-white/60 text-[8px] block">End</Label>
                      <Input type="time" value={config.endTime} onChange={e => setConfig(prev => ({ ...prev, endTime: e.target.value }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Price Zone</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-white/60 text-[8px] block">Min</Label>
                      <Input type="number" value={config.minPrice} onChange={e => setConfig(prev => ({ ...prev, minPrice: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                    </div>
                    <div>
                      <Label className="text-white/60 text-[8px] block">Max</Label>
                      <Input type="number" value={config.maxPrice} onChange={e => setConfig(prev => ({ ...prev, maxPrice: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Risk Management</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-white/60 text-[8px] block">Stop Loss</Label>
                      <Input type="number" value={config.stopLoss} onChange={e => setConfig(prev => ({ ...prev, stopLoss: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                    </div>
                    <div>
                      <Label className="text-white/60 text-[8px] block">Take Profit</Label>
                      <Input type="number" value={config.takeProfit} onChange={e => setConfig(prev => ({ ...prev, takeProfit: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex justify-end pt-4">
                <Button className="bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:from-amber-400 hover:to-amber-300">
                  Save Configuration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="flex-grow p-8 max-w-[1600px] w-full mx-auto flex flex-col space-y-8">
        {/* Asset summary */}
        {twelveDataLike && (
          <AssetSummaryCard
            data={twelveDataLike}
            precision={activeConfig.precision}
          />
        )}

        {/* Main grid: Context Engine + Indicators */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 flex flex-col">
            {context ? (
              <ContextEngineView context={context} />
            ) : (
              <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-8 text-center">
                <div className="text-white/40 text-xs">Initializing Market Context Engine...</div>
                {candleHistory.error && (
                  <div className="text-[#ef5350] text-[10px] mt-2">Data unavailable: {candleHistory.error}</div>
                )}
              </div>
            )}
          </div>
          <div className="lg:col-span-7 flex flex-col">
            {twelveDataLike ? (
              <TechnicalDetailsTable
                oscillators={twelveDataLike.oscillators}
                movingAverages={twelveDataLike.movingAverages}
                orderFlowIndicators={twelveDataLike.orderFlowIndicators}
              />
            ) : (
              <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-8 text-center text-white/40 text-xs">
                Loading technical analysis...
              </div>
            )}
          </div>
        </div>

        {/* Order flow + book + tape */}
        {twelveDataLike && (
          <RealtimeOrderFlow
            data={twelveDataLike}
            precision={activeConfig.precision}
          />
        )}
      </main>
    </div>
  );
};

export default Index;