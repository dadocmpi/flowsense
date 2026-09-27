import React from 'react';
import { IndicatorSignal } from '../../types/trading';
import { cn } from '@/lib/utils';

interface TechnicalDetailsTableProps {
  oscillators: IndicatorSignal[];
  movingAverages: IndicatorSignal[];
  volumeIndicators: IndicatorSignal[];
  isLoading?: boolean;
}

function actionColor(action: IndicatorSignal['action']): string {
  if (action.includes('BUY')) return 'text-green-400';
  if (action.includes('SELL')) return 'text-red-500';
  return 'text-amber-400';
}

function actionLabel(action: IndicatorSignal['action']): string {
  return action.charAt(0) + action.slice(1).toLowerCase();
}

const IndicatorGroup: React.FC<{ title: string; indicators: IndicatorSignal[]; emptyText: string }> = ({
  title,
  indicators,
  emptyText,
}) => (
  <div>
    <h3 className="text-white font-bold mb-3 flex items-center">
      <span className="w-4 h-4 bg-amber-400 rounded mr-2" />
      {title}
    </h3>
    <div className="space-y-2">
      {indicators.length > 0 ? (
        indicators.map(indicator => (
          <div key={indicator.name} className="flex items-center justify-between text-sm">
            <span className="flex-1 text-white/70" title={indicator.description}>
              {indicator.name}
            </span>
            <span className="w-28 text-right font-mono text-white/90">{indicator.value}</span>
            <span className={cn('w-24 text-center text-sm font-bold', actionColor(indicator.action))}>
              {actionLabel(indicator.action)}
            </span>
          </div>
        ))
      ) : (
        <div className="text-center text-white/50 italic py-4">{emptyText}</div>
      )}
    </div>
  </div>
);

export const TechnicalDetailsTable: React.FC<TechnicalDetailsTableProps> = ({
  oscillators,
  movingAverages,
  volumeIndicators,
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
      <IndicatorGroup title="Oscillators" indicators={oscillators} emptyText="Not enough candles for oscillators" />
      <IndicatorGroup title="Moving Averages" indicators={movingAverages} emptyText="Not enough candles for moving averages" />
      <IndicatorGroup
        title="Volume & Volatility"
        indicators={volumeIndicators}
        emptyText="Volume data unavailable for this instrument"
      />
    </div>
  );
};
