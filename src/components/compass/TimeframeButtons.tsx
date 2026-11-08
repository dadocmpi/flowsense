// ============================================
// TIMEFRAME BUTTONS
// ============================================
// The label ONLY — no score, no signal word, no colour implying a signal. Only
// the selected one is filled, and every button is disabled while a request is in
// flight so two loads can never race.

import React from 'react';
import type { Timeframe } from '../../core/types';
import { TIMEFRAMES, TIMEFRAME_LABELS } from '../../core/types';
import { cn } from '@/lib/utils';

interface TimeframeButtonsProps {
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
  busy: boolean;
}

export const TimeframeButtons: React.FC<TimeframeButtonsProps> = ({ selected, onSelect, busy }) => (
  <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Timeframe">
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
            'min-w-[2.5rem] rounded-sm border px-2 py-0.5 font-mono text-label font-medium transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-40',
            isSelected
              ? 'border-accent/60 bg-accent/15 text-accent'
              : 'border-line bg-base-1 text-ink-subtle hover:border-line hover:bg-base-3 hover:text-ink'
          )}
        >
          {TIMEFRAME_LABELS[timeframe]}
        </button>
      );
    })}
  </div>
);
