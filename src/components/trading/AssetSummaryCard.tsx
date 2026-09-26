import React from 'react';
import { MarketDataState, DataQualityScore } from '../../types/trading';
import { cn } from '@/lib/utils';

interface AssetSummaryCardProps {
  data: MarketDataState;
  dataQuality: DataQualityScore;
}

export const AssetSummaryCard: React.FC<AssetSummaryCardProps> = ({ data, dataQuality }) => {
  const formatPrice = (price: number) =>
    price.toLocaleString(undefined, { minimumFractionDigits: data.precision, maximumFractionDigits: data.precision });

  const lastCandle = data.candles[data.candles.length - 1];

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] p-6 shadow-[0_10_30px_rgba(0,0,0,0.5)]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Price Information */}
        <div className="space-y-4">
          <h3 className="text-white font-bold mb-3 flex items-center">
            <span className="w-4 h-4 bg-amber-400 rounded mr-2" />
            Price Action
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Current Price</span>
              <span className="font-mono text-2xl text-white">{formatPrice(data.price)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Change vs Prev Close</span>
              <span className={cn('font-mono text-xl', data.percentChange >= 0 ? 'text-green-400' : 'text-red-500')}>
                {data.percentChange >= 0 ? '+' : ''}{data.percentChange.toFixed(2)}%
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Session Range</span>
              <span className="font-mono text-white/90">
                {formatPrice(data.low)} – {formatPrice(data.high)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Last Candle Volume</span>
              <span className="font-mono text-white/90">
                {lastCandle && lastCandle.volume > 0 ? lastCandle.volume.toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Derived Analytics */}
        <div className="space-y-4">
          <h3 className="text-white font-bold mb-3 flex items-center">
            <span className="w-4 h-4 bg-amber-400 rounded mr-2" />
            Derived Analytics
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">ATR (14)</span>
              <span className="font-mono text-white/90">{data.atr !== null ? formatPrice(data.atr) : 'N/A'}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">VWAP</span>
              <span className="font-mono text-white/90">{data.vwap !== null ? formatPrice(data.vwap) : 'N/A'}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Volume POC</span>
              <span className="font-mono text-white/90">
                {data.pointOfControl !== null ? formatPrice(data.pointOfControl) : 'N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Candles Loaded</span>
              <span className="font-mono text-white/90">{data.candles.length}</span>
            </div>
          </div>
        </div>

        {/* Data Status */}
        <div className="space-y-4">
          <h3 className="text-white font-bold mb-3 flex items-center">
            <span className="w-4 h-4 bg-amber-400 rounded mr-2" />
            Data Status
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Freshness</span>
              <span className={cn(
                'font-mono text-lg font-bold',
                dataQuality.metrics.freshness === 'LIVE' ? 'text-green-400' :
                dataQuality.metrics.freshness === 'DELAYED' ? 'text-amber-400' : 'text-red-500'
              )}>
                {dataQuality.metrics.freshness}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Source</span>
              <span className="font-mono text-white/90">{dataQuality.metrics.source}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Data Quality</span>
              <span className={cn(
                'font-mono text-lg font-bold',
                dataQuality.overall >= 80 ? 'text-green-400' :
                dataQuality.overall >= 60 ? 'text-amber-400' : 'text-red-500'
              )}>
                {dataQuality.overall}%
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Last Bar</span>
              <span className="font-mono text-white/90">{data.datetime || 'N/A'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
