// ============================================
// ENTRY CHECK PANEL
// ============================================
// The actionable read: pick LONG or SHORT and see whether the timeframes back
// it. Every number shown here comes from checkEntry in core/entryCheck, so the
// panel cannot disagree with the confluence matrix above it.

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

const STANCE_STYLE: Record<string, string> = {
  AGREE: 'border-[#26a69a]/40 bg-[#26a69a]/10 text-[#4db6ac]',
  DISAGREE: 'border-[#ef5350]/40 bg-[#ef5350]/10 text-[#e57373]',
  NEUTRAL: 'border-white/[0.08] bg-white/[0.02] text-white/50',
  UNAVAILABLE: 'border-white/[0.06] bg-transparent text-white/25',
};

const STANCE_WORD: Record<string, string> = {
  AGREE: 'Agrees',
  DISAGREE: 'Disagrees',
  NEUTRAL: 'Neutral',
  UNAVAILABLE: 'No data',
};

export const EntryCheckPanel: React.FC<EntryCheckPanelProps> = ({ result, direction, onDirectionChange }) => {
  const style = VERDICT_STYLE[result.verdict];

  return (
    <div className="space-y-4">
      {/* Direction switch */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-micro font-semibold uppercase tracking-wider text-white/40">Checking a</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-white/[0.08]">
          {(['LONG', 'SHORT'] as EntryDirection[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => onDirectionChange(option)}
              aria-pressed={direction === option}
              className={cn(
                'px-4 py-1.5 text-label font-bold transition-colors',
                direction === option
                  ? option === 'LONG'
                    ? 'bg-[#26a69a] text-black'
                    : 'bg-[#ef5350] text-black'
                  : 'bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:text-white'
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Verdict */}
      <div className={cn('rounded-xl border px-4 py-4', style.ring)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <span className={cn('text-headline font-black leading-none', style.text)}>{style.word}</span>
            <span className="text-label text-white/50">
              {result.aligned} agree · {result.opposing} disagree · {result.neutral} neutral
              {result.unavailable > 0 && ` · ${result.unavailable} no data`}
            </span>
          </div>
          <span className="font-mono text-body text-white/60">{Math.round(result.share * 100)}% agree</span>
        </div>

        <p className="mt-2 text-body text-white/75">{result.message}</p>

        {result.higherTimeframeWarning && (
          <p className="mt-2 text-body font-semibold text-amber-400">
            ⚠ Higher timeframe conflict: {result.higherConflicts.map(frame => frame.label).join(', ')}
            {result.higherConflicts.length === 1 ? ' disagrees' : ' disagree'} with this {direction.toLowerCase()}.
          </p>
        )}
      </div>

      {/* Per-timeframe stance */}
      <div className="flex flex-wrap gap-2">
        {result.timeframes.map(frame => (
          <div
            key={frame.timeframe}
            className={cn('flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2', STANCE_STYLE[frame.stance])}
          >
            <span className="text-label font-bold">{frame.label}</span>
            <span className="text-micro">{STANCE_WORD[frame.stance]}</span>
            {frame.higher && frame.stance !== 'UNAVAILABLE' && (
              <span className="text-[0.5625rem] uppercase tracking-wide text-white/30">higher</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-label text-white/40">
        Agreement is weighted by timeframe, so higher timeframes carry more. Weights and rules live in{' '}
        <span className="font-mono text-white/60">src/config/compass.ts</span>.
      </p>
    </div>
  );
};
