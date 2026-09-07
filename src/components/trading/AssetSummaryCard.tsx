import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { cn } from '@/lib/utils';

interface AssetSummaryCardProps {
  data: TwelveDataState;
  precision: number;
}

export const AssetSummaryCard: React.FC<AssetSummaryCardProps> = ({
  data,
  precision,
}) => {
  const formatPrice = (price: number) => 
    price.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] p-6 shadow-[0_10_30px_rgba(0,0,0,0.5)]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Price Information */}
        <div className="space-y-4">
          <h3 className="text-white font-bold mb-3 flex items-center">
            <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
            Price Action
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Current Price</span>
              <span className="font-mono text-2xl text-white">
                {formatPrice(data.price)}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Daily Change</span>
              <span className={cn(
                "font-mono text-xl",
                data.percentChange >= 0 ? "text-green-400" : "text-red-500"
              )}>
                {data.percentChange >= 0 ? '+' : ''}{data.percentChange.toFixed(2)}%
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Volume Delta</span>
              <span className={cn(
                "font-mono text-xl",
                data.volumeDelta >= 0 ? "text-green-400" : "text-red-500"
              )}>
                {data.volumeDelta >= 0 ? '+' : ''}{data.volumeDelta.toFixed(0)}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Bid/Ask Spread</span>
              <span className="font-mono text-white/90">
                {data.asks.length > 0 && data.bids.length > 0 
                  ? ((data.asks[0].price - data.bids[0].price) * Math.pow(10, precision)).toFixed(precision) 
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Market Status */}
        <div className="space-y-4">
          <h3 className="text-white font-bold mb-3 flex items-center">
            <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
            Market Status
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Market State</span>
              <span className={cn(
                "font-mono text-lg font-bold",
                data.isLive ? "text-green-400" : "text-red-500"
              )}>
                {data.isLive ? 'LIVE' : 'DELAYED'}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Institutional Pressure</span>
              <span className={cn(
                "font-mono text-lg font-bold",
                data.institutionalPressure === 'HIGH' || data.institutionalPressure === 'EXTREME' 
                  ? "text-red-500" : 
                  data.institutionalPressure === 'MEDIUM' 
                    ? "text-amber-400" : 
                    "text-green-400"
              )}>
                {data.institutionalPressure}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Buyers/Sellers</span>
              <div className="flex items-center space-x-2">
                <span className="text-green-400 font-mono">{data.buyersPercent}%</span>
                <span className="text-white/50">|</span>
                <span className="text-red-500 font-mono">{data.sellersPercent}%</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Session & Time */}
        <div className="space-y-4">
          <h3 className="text-white font-bold mb-3 flex items-center">
            <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
            Session Info
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Session</span>
              <span className="font-mono text-white/90">
                {data.isMarketOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Local Time</span>
              <span className="font-mono text-white/90">
                {data.datetime}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Data Quality</span>
              <span className={cn(
                "font-mono text-lg font-bold",
                data.oscillators.length > 0 && data.movingAverages.length > 0 
                  ? "text-green-400" : 
                  "text-red-500"
              )}>
                {data.oscillators.length > 0 && data.movingAverages.length > 0 ? 'GOOD' : 'POOR'}
              </span>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};