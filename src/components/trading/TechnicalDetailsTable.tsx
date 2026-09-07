import React from 'react';
import { IndicatorSignal } from '../../types/trading';
import { cn } from '@/lib/utils';

interface TechnicalDetailsTableProps {
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  orderFlowIndicators: IndicatorSignal[];
  isLoading?: boolean;
}

export const TechnicalDetailsTable: React.FC<TechnicalDetailsTableProps> = ({
  oscillators,
  movingAverages,
  orderFlowIndicators,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center space-x-3 h-10">
            <div className="w-20 bg-white/5 rounded animate-pulse" />
            <div className="flex-1 bg-white/5 rounded h-2 animate-pulse" />
            <div className="w-20 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Oscillators */}
      <div>
        <h3 className="text-white font-bold mb-3 flex items-center">
          <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
          Oscillators
        </h3>
        <div className="space-y-2">
          {oscillators.map(indicator => (
            <div key={indicator.name} className="flex items-center justify-between text-sm">
              <span className="flex-1 text-white/70">{indicator.name}</span>
              <span className="w-20 text-right font-mono text-white/90">{indicator.value}</span>
              <span className="w-20 text-center 
                {indicator.action.includes('BUY') ? 'text-green-400' : 
                 indicator.action.includes('SELL') ? 'text-red-500' : 
                 'text-amber-400'} font-bold text-sm"
              >
                {indicator.action}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Moving Averages */}
      <div>
        <h3 className="text-white font-bold mb-3 flex items-center">
          <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
          Moving Averages
        </h3>
        <div className="space-y-2">
          {movingAverages.map(indicator => (
            <div key={indicator.name} className="flex items-center justify-between text-sm">
              <span className="flex-1 text-white/70">{indicator.name}</span>
              <span className="w-20 text-right font-mono text-white/90">{indicator.value}</span>
              <span className="w-20 text-center 
                {indicator.action.includes('BUY') ? 'text-green-400' : 
                 indicator.action.includes('SELL') ? 'text-red-500' : 
                 'text-amber-400'} font-bold text-sm"
              >
                {indicator.action}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Order Flow Indicators */}
      <div>
        <h3 className="text-white font-bold mb-3 flex items-center">
          <span className="w-4 h-4 bg-amber-400 rounded mr-2"></span>
          Order Flow Indicators
        </h3>
        <div className="space-y-2">
          {orderFlowIndicators.length > 0 ? (
            orderFlowIndicators.map(indicator => (
              <div key={indicator.name} className="flex items-center justify-between text-sm">
                <span className="flex-1 text-white/70">{indicator.name}</span>
                <span className="w-20 text-right font-mono text-white/90">{indicator.value}</span>
                <span className="w-20 text-center 
                  {indicator.action.includes('BUY') ? 'text-green-400' : 
                   indicator.action.includes('SELL') ? 'text-red-500' : 
                   'text-amber-400'} font-bold text-sm"
                >
                  {indicator.action}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center text-white/50 italic py-4">
              No order flow data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};