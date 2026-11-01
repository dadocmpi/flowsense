// ============================================
// TIMEFRAME BUTTONS
// ============================================
// Small buttons with the label and nothing else: no score, no signal word, no
// colour that could be read as a signal. Only the selected one is highlighted.
//
// Clicking one fetches REAL data for that timeframe alone. Every button is
// disabled while a request is in flight, so two loads can never race.

import React from 'react';
import type { Timeframe } from '../../core/types';
import { TIMEFRAMES, TIMEFRAME_LABELS } from '../../core/types';
import { cn } from '@/lib/utils';

interface TimeframeButtonsProps {
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
  /** True while any timeframe request is in flight. */
  busy: boolean;
}

export const TimeframeButtons: React.FC<TimeframeButtonsProps> = ({ selected, onSelect, busy }) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Timeframe">
      {TIMEFRAMES.map(timeframe => {
        const isSelected = timeframe === selected;
        return (
          <button
            key={timeframe}
            type="button"
            onClick={() => onSelect(timeframe)}
            disabled={busy}
            aria-pressed={isSelected}
            className={cn(
              'min-w-[2.75rem] rounded-md border px-2.5 py-1 font-mono text-label font-bold transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40',
              isSelected
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20 hover:text-white'
            )}
          >
            {TIMEFRAME_LABELS[timeframe]}
          </button>
        );
      })}
    </div>
  );
};
