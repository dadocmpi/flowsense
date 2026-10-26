// ============================================
// TIMEFRAME LIST
// ============================================
// The one and only place every timeframe is shown. Each row carries the
// timeframe, its colour-coded label and its score; clicking a row selects it
// for the main compass. The overall bias line sits at the bottom.

import React from 'react';
import type { MultiTimeframeReading } from '../../core/multiTimeframe';
import type { Timeframe } from '../../core/types';
import { TIMEFRAME_LABELS } from '../../core/types';
import { labelShort, scoreColor } from './format';
import { cn } from '@/lib/utils';

interface TimeframeListProps {
  reading: MultiTimeframeReading;
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
}

/** How many timeframes point the same way as the overall bias. */
function alignedWithBias(reading: MultiTimeframeReading): number {
  const direction = reading.confluence.direction;
  if (!direction) return 0;
  return reading.timeframes.filter(frame => {
    if (!frame.available || frame.summary.score === 0) return false;
    return direction === 'BULLISH' ? frame.summary.score > 0 : frame.summary.score < 0;
  }).length;
}

export const TimeframeList: React.FC<TimeframeListProps> = ({ reading, selected, onSelect }) => {
  const { confluence } = reading;
  const biasColor = scoreColor(confluence.bias);
  const aligned = alignedWithBias(reading);
  const total = reading.timeframes.length;

  return (
    <div className="flex h-full flex-col">
      <ul className="flex flex-col gap-1.5">
        {reading.timeframes.map(frame => {
          const isSelected = frame.timeframe === selected;
          const color = frame.available ? scoreColor(frame.summary.score) : '#6b7280';

          return (
            <li key={frame.timeframe}>
              <button
                type="button"
                onClick={() => onSelect(frame.timeframe)}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-amber-400/60 bg-amber-400/[0.08]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                )}
              >
                <span className="w-14 text-title font-bold text-white/80">
                  {TIMEFRAME_LABELS[frame.timeframe] ?? frame.timeframe}
                </span>
                {frame.available ? (
                  <>
                    <span className="flex-1 text-title font-bold" style={{ color }}>
                      {labelShort(frame.summary.label)}
                    </span>
                    <span className="font-mono text-title font-bold" style={{ color }}>
                      {Math.round(frame.summary.score)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-title font-bold text-white/30">No data</span>
                    <span className="font-mono text-title text-white/25">--</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-4">
        <p className="text-2xl font-bold leading-tight">
          <span className="text-white/50">Overall bias: </span>
          <span style={{ color: biasColor }}>{labelShort(confluence.label)}</span>
          <span className="text-white/50">
            , {aligned} of {total} aligned
          </span>
        </p>
      </div>
    </div>
  );
};
