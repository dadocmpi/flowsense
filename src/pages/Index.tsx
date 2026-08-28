import React, { useState, useEffect, useMemo } from 'react';
import { useBinanceFeed } from '../hooks/useBinanceFeed';
import { useCandleHistory } from '../hooks/useCandleHistory';
import { useMarketContext } from '../hooks/useMarketContext';
import { TradingViewGauge } from '../components/trading/TradingViewGauge';
import { MarketTerminal } from '../components/trading/MarketTerminal';
import { ZoneRadar } from '../components/trading/ZoneRadar';
import { EvidencePanel } from '../components/trading/EvidencePanel';
import { AssetSummaryCard } from '../components/trading/AssetSummaryCard';
import { RealtimeOrderFlow } from '../components/trading/RealtimeOrderFlow';
import { RealOrderBook } from '../components/trading/RealOrderBook';
import { LiveTradeFeed } from '../components/trading/LiveTradeFeed';
import { TechnicalDetailsTable } from '../components/trading/TechnicalDetailsTable';
import { TwelveDataState, TradeFeedItem, SUPPORTED_ASSETS, IndicatorSignal } from '../types/trading';
import { fmtPrice, fmtChange, fmtPercent, fmtDataQuality } from '../lib/formatters';
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
  const precision = activeConfig.precision;

  // Real-time Binance feed
  const feed = useBinanceFeed(binanceSymbol);
  // Historical candles for structure/zone detection
  const candleHistory = useCandleHistory(binanceSymbol, '1m', 200);

  // Build Market Context
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

  // Adapt feed to TwelveDataState for legacy components
  const twelveData = useMemo<TwelveDataState | null>(() => {
    if (!feed.ticker) return null;
    const t = feed.ticker;

    const oscillators: IndicatorSignal[] = context
      ? context.positiveFactors.concat(context.negativeFactors).concat(context.neutralFactors)
          .filter(f => ['RSI', 'MACD', 'MOMENTUM'].includes(f.category))
          .map(f => ({
            name: f.label,
            value: f.description || '',
            action: (f.polarity === 'POSITIVE' ? 'BUY' : f.polarity === 'NEGATIVE' ? 'SELL' : 'NEUTRAL') as any,
          }))
      : [];

    const movingAverages: IndicatorSignal[] = context
      ? context.positiveFactors.concat(context.negativeFactors)
          .filter(f => ['STRUCTURAL_EMA'].includes(f.category))
          .map(f => ({
            name: f.label,
            value: f.description || '',
            action: (f.polarity === 'POSITIVE' ? 'BUY' : f.polarity === 'NEGATIVE' ? 'SELL' : 'NEUTRAL') as any,
          }))
      : [];

    const orderFlowIndicators: IndicatorSignal[] = context
      ? context.positiveFactors.concat(context.negativeFactors)
          .filter(f => ['ORDER_FLOW', 'ORDER_BOOK', 'VOLUME'].includes(f.category))
          .map(f => ({
            name: f.label,
            value: f.description || '',
            action: (f.polarity === 'POSITIVE' ? 'BUY' : f.polarity === 'NEGATIVE' ? 'SELL' : 'NEUTRAL') as any,
          }))
      : [];

    const ctxScore = context?.contextScore ?? 0;
    const verdict =
      context?.directionalBias === 'BULLISH'
        ? ctxScore > 30 ? 'STRONG BUY' : 'BUY'
        : context?.directionalBias === 'BEARISH'
        ? ctxScore < -30 ? 'STRONG SELL' : 'SELL'
        : 'NEUTRAL';

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
      oscillators,
      movingAverages,
      orderFlowIndicators,
      buyersPercent: Math.round(feed.buyerDominance * 100),
      sellersPercent: Math.round((1 - feed.buyerDominance) * 100),
      volumeDelta: feed.volumeDelta,
      institutionalPressure:
        Math.abs(feed.volumeDelta) > 50 ? 'EXTREME' :
        Math.abs(feed.volumeDelta) > 20 ? 'HIGH' :
        Math.abs(feed.volumeDelta) > 5 ? 'MEDIUM' : 'LOW',
      bids: feed.bids.map(b => ({ price: b.price, size: b.size, cumulativeSize: b.size, percentage: b.percentage })),
      asks: feed.asks.map(a => ({ price: a.price, size: a.size, cumulativeSize: a.size, percentage: a.percentage })),
      recentTrades: feed.recentTrades.map(tr => ({
        id: tr.id,
        price: tr.price,
        size: tr.size,
        time: tr.time,
        type: tr.isBuyerMaker ? 'SELL' : 'BUY',
        aggressor: tr.isBuyerMaker ? 'SELL_AGGR' : 'BUY_AGGR',
      })) as TradeFeedItem[],
      overallSummary: {
        buyCount: context ? Math.round(context.positiveFactors.reduce((s, f) => s + Math.abs(f.weight), 0)) : 0,
        neutralCount: context?.neutralFactors.length ?? 0,
        sellCount: context ? Math.round(context.negativeFactors.reduce((s, f) => s + Math.abs(f.weight), 0)) : 0,
        score: Math.abs(ctxScore),
        verdict,
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
      try { setConfig(JSON.parse(saved)); } catch (e) { /* ignore */ }
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
      
      {/* ── Header ── */}
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-6 py-3 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        
        {/* Instrument Selector */}
        <div className="flex items-center space-x-3">
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

        {/* Status Indicators */}
        <div className="flex items-center space-x-3">
          {/* Data Quality */}
          {context && (
            <div className={cn(
              "flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold",
              context.dataQuality.score >= 0.8 ? 'bg-[#26a69a]/10 text-[#26a69a] border border-[#26a69a]/20' :
              context.dataQuality.score >= 0.5 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
              'bg-[#ef5350]/10 text-[#ef5350] border border-[#ef5350]/20'
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full",
                context.dataQuality.score >= 0.8 ? 'bg-[#26a69a] animate-pulse' :
                context.dataQuality.score >= 0.5 ? 'bg-amber-400' : 'bg-[#ef5350]'
              )} />
              DQ: {Math.round(context.dataQuality.score * 100)}%
            </div>
          )}

          {/* Feed Status */}
          <div className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-full">
            <span className={cn("w-2 h-2 rounded-full", feed.isConnected ? 'bg-[#26a69a] animate-pulse' : 'bg-[#ef5350]')} />
            <span className="text-[10px] font-bold text-white/60">
              {feed.isConnected ? 'LIVE' : 'RECONNECTING'}
            </span>
          </div>

          {/* Market State */}
          {context && (
            <div className={cn(
              "flex items-center space-x-2 px-3 py-1.5 rounded-full text-[10px] font-bold",
              context.state === 'HIGH_CONFLUENCE' ? 'bg-[#26a69a]/15 text-[#26a69a] border border-[#26a69a]/30' :
              context.state === 'CONFLICT' ? 'bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/30' :
              context.state === 'APPROACHING_ZONE' || context.state === 'IN_ZONE' || context.state === 'ANALYZING' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
              'bg-white/[0.02] text-white/60 border border-white/[0.05]'
            )}>
              {context.state === 'HIGH_CONFLUENCE' && <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />}
              {context.state.replace(/_/g, ' ')}
            </div>
          )}

          {/* Config Button */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-full hover:bg-white/[0.03] transition-colors text-[10px] font-bold text-white/60">
                ⚙ ZONE CONFIG
              </button>
            </DialogTrigger>
            <DialogContent className="w-[400px] bg-[#0b0c10] border border-white/[0.08] rounded-3xl p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)]">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-black text-white">Trading Zone Configuration</DialogTitle>
                <DialogDescription className="mt-2 text-white/60 text-sm">
                  Parameters for {displayNameMap[selectedAsset] || selectedAsset}
                </DialogDescription>
              </DialogHeader>
              <Separator className="my-4" />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70 font-medium text-[9px] uppercase tracking-wider">Direction</Label>
                  <RadioGroup value={config.direction} onValueChange={(v: any) => setConfig((prev: any) => ({ ...prev, direction: v }))} className="flex items-center space-x-4">
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white/60 text-[8px] block mb-1">Start Time</Label>
                    <Input type="time" value={config.startTime} onChange={e => setConfig((prev: any) => ({ ...prev, startTime: e.target.value }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                  </div>
                  <div>
                    <Label className="text-white/60 text-[8px] block mb-1">End Time</Label>
                    <Input type="time" value={config.endTime} onChange={e => setConfig((prev: any) => ({ ...prev, endTime: e.target.value }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white/60 text-[8px] block mb-1">Min Price ($)</Label>
                    <Input type="number" value={config.minPrice} onChange={e => setConfig((prev: any) => ({ ...prev, minPrice: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                  </div>
                  <div>
                    <Label className="text-white/60 text-[8px] block mb-1">Max Price ($)</Label>
                    <Input type="number" value={config.maxPrice} onChange={e => setConfig((prev: any) => ({ ...prev, maxPrice: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-white/60 text-[8px] block mb-1">Stop Loss ($)</Label>
                    <Input type="number" value={config.stopLoss} onChange={e => setConfig((prev: any) => ({ ...prev, stopLoss: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
                  </div>
                  <div>
                    <Label className="text-white/60 text-[8px] block mb-1">Take Profit ($)</Label>
                    <Input type="number" value={config.takeProfit} onChange={e => setConfig((prev: any) => ({ ...prev, takeProfit: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#12131a] border border-white/[0.04] rounded px-3 py-1.5 text-white text-xs" />
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

      {/* ── Main Terminal Content ── */}
      <main className="flex-grow p-6 max-w-[1800px] w-full mx-auto flex flex-col gap-6">

        {/* Asset Summary Bar */}
        {twelveData && (
          <AssetSummaryCard data={twelveData} precision={precision} />
        )}

        {/* Row 1: Compass + Market Terminal + Zone Radar */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Compass (4 cols) */}
          <div className="xl:col-span-3 flex flex-col">
            <TradingViewGauge context={context} selectedAsset={selectedAsset} />
          </div>

          {/* Market Terminal (5 cols) */}
          <div className="xl:col-span-5 flex flex-col">
            {context ? (
              <MarketTerminal context={context} precision={precision} />
            ) : (
              <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-8 text-center flex items-center justify-center h-full min-h-[400px]">
                <div className="text-center">
                  <div className="text-white/30 text-xs mb-2">Initializing Market Context Engine</div>
                  {candleHistory.error && (
                    <div className="text-[#ef5350] text-[10px] mt-1">Data Error: {candleHistory.error}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Zone Radar (4 cols) */}
          <div className="xl:col-span-4 flex flex-col">
            <ZoneRadar
              zones={context?.activeZones ?? []}
              currentPrice={feed.ticker?.price ?? 0}
              precision={precision}
            />
          </div>
        </div>

        {/* Row 2: Evidence Panel + Order Book + Trades */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Evidence Panel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <EvidencePanel
              positiveFactors={context?.positiveFactors ?? []}
              negativeFactors={context?.negativeFactors ?? []}
              neutralFactors={context?.neutralFactors ?? []}
              oscillators={twelveData?.oscillators}
              movingAverages={twelveData?.movingAverages}
              orderFlowIndicators={twelveData?.orderFlowIndicators}
              compact={false}
            />
          </div>

          {/* Order Book (3.5 cols) */}
          <div className="lg:col-span-3 flex flex-col">
            {feed.hasOrderBook && feed.bids.length > 0 ? (
              <RealOrderBook
                bids={feed.bids.map(b => ({ price: b.price, size: b.size, total: b.total, percentage: b.percentage }))}
                asks={feed.asks.map(a => ({ price: a.price, size: a.size, total: a.total, percentage: a.percentage }))}
                currentPrice={feed.ticker?.price ?? 0}
                precision={precision}
              />
            ) : (
              <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-white/20 text-xs mb-1">Order Book</div>
                  <div className="text-[#ef5350]/60 text-[10px]">
                    {feed.isConnected ? 'DATA UNAVAILABLE' : 'FEED DISCONNECTED'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live Trades (3.5 cols) */}
          <div className="lg:col-span-4 flex flex-col">
            {feed.hasTape && feed.recentTrades.length > 0 ? (
              <LiveTradeFeed
                trades={feed.recentTrades.map(t => ({
                  id: t.id,
                  price: t.price,
                  size: t.size,
                  time: t.time,
                  isBuyerMaker: t.isBuyerMaker,
                }))}
                precision={precision}
              />
            ) : (
              <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-white/20 text-xs mb-1">Settled Trades</div>
                  <div className="text-[#ef5350]/60 text-[10px]">
                    {feed.isConnected ? 'DATA UNAVAILABLE' : 'FEED DISCONNECTED'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Full-width Order Flow */}
        {twelveData && (
          <RealtimeOrderFlow data={twelveData} precision={precision} />
        )}

      </main>
    </div>
  );
};

export default Index;