// ============================================
// TIMEFRAME SELECTOR
// ============================================
// The timeframe buttons in the top bar. The selected timeframe drives the main
// compass. M15 is the default.

import React from 'react';
import type { Timeframe } from '../../core/types';
import { TIMEFRAMES, TIMEFRAME_LABELS } from '../../core/types';
import { cn } from '@/lib/utils';

interface TimeframeSelectorProps {
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
}

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="flex items-center gap-1">
      {TIMEFRAMES.map(timeframe => {
        const isSelected = selected === timeframe;
        return (
          <button
            key={timeframe}
            type="button"
            onClick={() => onSelect(timeframe)}
            aria-pressed={isSelected}
            className={cn(
              'rounded-lg px-3 py-1.5 text-label font-bold tracking-wide transition-all',
              isSelected
                ? 'bg-white/[0.12] text-white'
                : 'text-white/50 hover:bg-white/[0.05] hover:text-white'
            )}
          >
            {TIMEFRAME_LABELS[timeframe]}
          </button>
        );
      })}
    </div>
  );
};
