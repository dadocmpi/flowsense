import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { cn } from '@/lib/utils';

interface RealtimeOrderFlowProps {
  data: TwelveDataState;
  precision: number;
}

export const RealtimeOrderFlow: React.FC<RealtimeOrderFlowProps> = ({
  data,
  precision,
}) => {
  const formatPrice = (price: number) => 
    price.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] p-6">
      <div className="mb-4">
        <h3 className="text-white font-bold mb-3 flex items-center">
          <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
          Real-Time Order Flow
        </h3>
      </div>
      
      {/* Order Book */}
      <div className="mb-6">
        <h4 className="text-white font-semibold mb-2">Order Book (Top 5 Levels)</h4>
        <div className="overflow-hidden rounded border border-white/[0.04]">
          <div className="divide-y divide-white/[0.02]">
            {/* Bids */}
            {data.bids.slice(0, 5).map((bid, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex-1 text-right text-green-400 font-mono">
                  {formatPrice(bid.price)}
                </span>
                <span className="flex-1 text-center text-white/70 font-mono">
                  {bid.size.toFixed(2)}
                </span>
                <span className="w-16 text-left text-white/50 font-mono">
                  {bid.percentage.toFixed(0)}%
                </span>
              </div>
            ))}
            <div className="px-4 py-2 text-xs text-white/30 bg-white/[0.01]">
              <span className="flex-1 text-right">BIDS</span>
              <span className="flex-1 text-center">SIZE</span>
              <span className="w-16 text-left">%</span>
            </div>
            {/* Asks (reversed to show highest first) */}
            {data.asks.slice(0, 5).reverse().map((ask, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="w-16 text-left text-white/50 font-mono">
                  {ask.percentage.toFixed(0)}%
                </span>
                <span className="flex-1 text-center text-white/70 font-mono">
                  {ask.size.toFixed(2)}
                </span>
                <span className="flex-1 text-left text-red-500 font-mono">
                  {formatPrice(ask.price)}
                </span>
              </div>
            ))}
            <div className="px-4 py-2 text-xs text-white/30 bg-white/[0.01]">
              <span className="w-16 text-left">%</span>
              <span className="flex-1 text-center">SIZE</span>
              <span className="flex-1 text-left">ASKS</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Trades */}
      <div className="mb-6">
        <h4 className="text-white font-semibold mb-2">Recent Trades (Last 10)</h4>
        <div className="overflow-hidden rounded border border-white/[0.04]">
          <div className="divide-y divide-white/[0.02]">
            {data.recentTrades.slice(0, 10).map((trade, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="flex-1 text-right text-white/50 font-mono">
                  {trade.time}
                </span>
                <span className="flex-1 text-center text-white/70 font-mono">
                  {formatPrice(trade.price)}
                </span>
                <span className="flex-1 text-center text-white/70 font-mono">
                  {trade.size.toFixed(2)}
                </span>
                <span className="w-16 text-left 
                  {trade.type === 'BUY' ? 'text-green-400' : 'text-red-500'} font-bold text-sm"
                >
                  {trade.type}
                </span>
              </div>
            ))}
            {data.recentTrades.length === 0 && (
              <div className="px-4 py-4 text-center text-white/50 italic">
                No recent trades
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Volume Profile */}
      <div>
        <h4 className="text-white font-semibold mb-2">Volume Profile</h4>
        <div className="bg-white/[0.02] rounded border border-white/[0.04] p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-white/50">Buy Volume:</span>
              <span className="font-mono text-white">{data.buyersPercent}%</span>
            </div>
            <div>
              <span className="text-white/50">Sell Volume:</span>
              <span className="font-mono text-white">{data.sellersPercent}%</span>
            </div>
            <div>
              <span className="text-white/50">Volume Delta:</span>
              <span className={cn(
                "font-mono text-white",
                data.volumeDelta >= 0 ? "text-green-400" : "text-red-500"
              )}>
                {data.volumeDelta >= 0 ? '+' : ''}{Math.abs(data.volumeDelta).toFixed(0)}
              </span>
            </div>
            <div>
              <span className="text-white/50">Pressure:</span>
              <span className={cn(
                "font-mono text-white",
                data.institutionalPressure === 'HIGH' || data.institutionalPressure === 'EXTREME' 
                  ? "text-red-500" : 
                  data.institutionalPressure === 'MEDIUM' 
                    ? "text-amber-400" : 
                    "text-green-400"
              )}>
                {data.institutionalPressure}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};