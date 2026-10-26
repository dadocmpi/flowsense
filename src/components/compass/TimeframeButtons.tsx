// ============================================
// TIMEFRAME BUTTONS
// ============================================
// A row of compact selectors above the compass. They select which timeframe the
// compass reads; they carry no label, score or colour of their own, so the only
// thing they show is which one is active.

import React from 'react';
import { TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from '../../core/types';
import { cn } from '@/lib/utils';

interface TimeframeButtonsProps {
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
}

export const TimeframeButtons: React.FC<TimeframeButtonsProps> = ({ selected, onSelect }) => {
  return (
    <div className="flex items-center justify-center gap-[clamp(0.25rem,0.6vw,0.6rem)]">
      {TIMEFRAMES.map(timeframe => {
        const isSelected = timeframe === selected;
        return (
          <button
            key={timeframe}
            type="button"
            onClick={() => onSelect(timeframe)}
            aria-pressed={isSelected}
            className={cn(
              'rounded-md border px-[clamp(0.6rem,1.1vw,1.1rem)] py-[clamp(0.2rem,0.5vh,0.45rem)] font-mono font-bold tracking-wide transition-colors',
              isSelected
                ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
                : 'border-white/[0.06] bg-white/[0.02] text-white/45 hover:border-white/15 hover:text-white/80'
            )}
            style={{ fontSize: 'clamp(0.7rem,0.95vw,1rem)' }}
          >
            {TIMEFRAME_LABELS[timeframe]}
          </button>
        );
      })}
    </div>
  );
};
