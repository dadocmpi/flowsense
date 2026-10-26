// ============================================
// ENTRY CHECK PANEL
// ============================================
// The actionable read: pick LONG or SHORT and see whether the timeframes back
// it. Every number shown here comes from checkEntry in core/entryCheck, so the
// panel cannot disagree with the compass.
//
// Only the timeframes that DISAGREE are listed. A board where everything agrees
// is the common case, and naming seven agreeing timeframes adds noise without
// adding information — so it says "All timeframes agree" instead.

import React from 'react';
import type { EntryCheckResult, EntryDirection } from '../../core/entryCheck';
import { cn } from '@/lib/utils';

interface EntryCheckPanelProps {
  result: EntryCheckResult;
  direction: EntryDirection;
  onDirectionChange: (direction: EntryDirection) => void;
}

const VERDICT_STYLE: Record<EntryCheckResult['verdict'], { text: string; ring: string; word: string }> = {
  ALIGNED: { text: 'text-[#26a69a]', ring: 'border-[#26a69a]/40 bg-[#26a69a]/10', word: 'Aligned' },
  PARTIAL: { text: 'text-amber-400', ring: 'border-amber-500/40 bg-amber-500/10', word: 'Partial' },
  AGAINST: { text: 'text-[#ef5350]', ring: 'border-[#ef5350]/40 bg-[#ef5350]/10', word: 'Against' },
};

export const EntryCheckPanel: React.FC<EntryCheckPanelProps> = ({ result, direction, onDirectionChange }) => {
  const style = VERDICT_STYLE[result.verdict];

  return (
    <div className="flex h-full flex-col gap-[clamp(0.75rem,1.6vh,1.5rem)]">
      {/* Direction switch */}
      <div className="grid grid-cols-2 gap-2">
        {(['LONG', 'SHORT'] as EntryDirection[]).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onDirectionChange(option)}
            aria-pressed={direction === option}
            className={cn(
              'rounded-xl border px-4 py-[clamp(0.5rem,1.4vh,1rem)] text-center font-black tracking-wide transition-colors',
              direction === option
                ? option === 'LONG'
                  ? 'border-[#26a69a] bg-[#26a69a] text-black'
                  : 'border-[#ef5350] bg-[#ef5350] text-black'
                : 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white'
            )}
            style={{ fontSize: 'clamp(1rem,1.6vw,1.6rem)' }}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Verdict */}
      <div
        className={cn(
          'rounded-2xl border px-[clamp(0.75rem,1.2vw,1.5rem)] py-[clamp(0.75rem,1.6vh,1.5rem)]',
          style.ring
        )}
      >
        <div className={cn('font-black leading-none', style.text)} style={{ fontSize: 'clamp(1.75rem,3.2vw,3.25rem)' }}>
          {style.word}
        </div>

        <p className="mt-[clamp(0.4rem,1vh,0.85rem)] text-body text-white/70">
          {result.total > 0
            ? `${result.aligned} of ${result.total} timeframes aligned`
            : 'No timeframe has taken a side yet'}
        </p>

        {result.higherTimeframeWarning && (
          <p className="mt-[clamp(0.4rem,1vh,0.85rem)] text-body font-semibold text-amber-400">
            {result.higherConflicts.map(frame => frame.label).join(', ')}
            {result.higherConflicts.length === 1 ? ' disagrees' : ' disagree'} with this {direction.toLowerCase()}.
          </p>
        )}
      </div>

      {/* Only the timeframes that disagree */}
      <div className="flex flex-wrap gap-2">
        {result.disagreeing.length > 0 ? (
          result.disagreeing.map(frame => (
            <span
              key={frame.timeframe}
              className="rounded-lg border border-[#ef5350]/40 bg-[#ef5350]/10 px-3 py-1.5 font-bold text-[#e57373]"
            >
              {frame.label}
            </span>
          ))
        ) : (
          <span className="rounded-lg border border-[#26a69a]/40 bg-[#26a69a]/10 px-3 py-1.5 font-semibold text-[#4db6ac]">
            All timeframes agree
          </span>
        )}
      </div>
    </div>
  );
};
