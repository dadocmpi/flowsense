import React from 'react';
import { OrderBookLevel, TradingMetrics } from '../../types/trading';
import { cn } from '@/lib/utils';

interface OrderFlowFeedProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  currentPrice: number;
  metrics: TradingMetrics;
  asset: string;
}

export const OrderFlowFeed: React.FC<OrderFlowFeedProps> = ({ 
  bids, 
  asks, 
  currentPrice, 
  metrics,
  asset
}) => {
  const formatPrice = (val: number) => {
    if (!val) return '0.00';
    if (asset.includes('EUR')) return val.toFixed(5);
    return val.toFixed(2);
  };

  return (
    <div className="flex flex-col flex-grow bg<dyad-write path="src/components/trading/OrderFlowFeed.tsx" description="Fixed: all Portuguese text → English in OrderFlowFeed">
import React from 'react';
import { OrderBookLevel, TradingMetrics } from '../../types/trading';
import { cn } from '@/lib/utils';

interface OrderFlowFeedProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  currentPrice: number;
  metrics: TradingMetrics;
  asset: string;
}

export const OrderFlowFeed: React.FC<OrderFlowFeedProps> = ({ 
  bids, 
  asks, 
  currentPrice, 
  metrics,
  asset
}) => {
  const formatPrice = (val: number) => {
    if (!val) return '0.00';
    if (asset.includes('EUR')) return val.toFixed(5);
    return val.toFixed(2);
  };

  return (
    <div className="flex flex-col flex-grow bg-[#0d0e12] overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.03]">
        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Order Flow</h3>
      </div>

      {/* Buyers vs Sellers */}
      <div className="grid grid-cols-2 gap-4 px-6 py-3 border-b border-white/[0.02]">
        <div className="text-left">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Buyers</span>
          <span className="text-lg font-mono font-bold text-[#26a69a]">{metrics.buyersPercent}%</span>
        </div>
        <div className="text-right">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Sellers</span>
          <span className="text-lg font-mono font-bold text-[#ef5350]">{metrics.sellersPercent}%</span>
        </div>
      </div>

      {/* Order Book Ladder */}
      <div className="flex-grow overflow-y-auto px-4 py-2 font-mono text-[10px] flex flex-col justify-center">
        <div className="space-y-[3px]">
          {/* Asks — Top */}
          {asks.slice(0, 5).reverse().map((ask, idx) => (
            <div key={`ask-${idx}`} className="grid grid-cols-3 items-center h-5 relative">
              <div />
              <div className="text-center text-white/50 text-[9px] z-10">
                {formatPrice(ask.price)}
              </div>
              <div className="relative h-full flex items-center justify-start pl-2">
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-[#ef5350]/15 border-l border-[#ef5350]/40 rounded-[1px]" 
                  style={{ width: `${ask.percentage}%` }}
                />
                <span className="text-[8px] text-white/30 z-10">{ask.size}</span>
              </div>
            </div>
          ))}

          {/* Current Price Highlighted */}
          <div className="grid grid-cols-3 items-center h-7 border-y border-white/[0.04] bg-white/[0.01] my-1">
            <div className="text-left pl-2 text-[8px] text-white/30 uppercase tracking-wider">Price</div>
            <div className="text-center text-xs font-bold text-[#ef5350] animate-pulse">
              {formatPrice(currentPrice)}
            </div>
            <div className="text-right pr-2 text-[8px] text-white/30">LIVE</div>
          </div>

          {/* Bids — Bottom */}
          {bids.slice(0, 5).map((bid, idx) => (
            <div key={`bid-${idx}`} className="grid grid-cols-3 items-center h-5 relative">
              <div className="relative h-full flex items-center justify-end pr-2">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-[#26a69a]/15 border-r border-[#26a69a]/40 rounded-[1px]" 
                  style={{ width: `${bid.percentage}%` }}
                />
                <span className="text-[8px] text-white/30 z-10">{bid.size}</span>
              </div>
              <div className="text-center text-white/50 text-[9px] z-10">
                {formatPrice(bid.price)}
              </div>
              <div />
            </div>
          ))}
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="grid grid-cols-2 border-t border-white/[0.03] bg-black/40">
        <div className="p-4 border-r border-white/[0.03]">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Delta</span>
          <span className={cn(
            "text-xs font-mono font-bold block mt-1",
            metrics.delta >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"
          )}>
            {metrics.delta >= 0 ? '+' : ''}{metrics.delta.toLocaleString()}
          </span>
        </div>
        <div className="p-4">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Absorption</span>
          <span className="text-xs font-bold text-amber-500 block mt-1 uppercase tracking-wider">
            {metrics.absorcao}
          </span>
        </div>
      </div>
    </div>
  );
};