// ============================================
// ENTRY CHECK PANEL
// ============================================
// Pick LONG or SHORT and see whether the timeframes back it. Every number
// shown here comes from checkEntry in core/entryCheck, so the panel cannot
// disagree with the timeframe list.
//
// Deliberately minimal: the verdict word, the alignment count, the timeframes
// that disagree, and — when the higher timeframes fight the trade — one short
// warning. Nothing else.

import React from 'react';
import type { EntryCheckResult, EntryDirection } from '../../core/entryCheck';
import { cn } from '@/lib/utils';

interface EntryCheckPanelProps {
  result: EntryCheckResult;
  direction: EntryDirection;
  onDirectionChange: (direction: EntryDirection) => void;
}

const VERDICT_STYLE: Record<EntryCheckResult['verdict'], { text: string; word: string }> = {
  ALIGNED: { text: 'text-[#26a69a]', word: 'ALIGNED' },
  PARTIAL: { text: 'text-amber-400', word: 'PARTIAL' },
  AGAINST: { text: 'text-[#ef5350]', word: 'AGAINST' },
};

export const EntryCheckPanel: React.FC<EntryCheckPanelProps> = ({ result, direction, onDirectionChange }) => {
  const style = VERDICT_STYLE[result.verdict];

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Direction switch */}
      <div className="grid grid-cols-2 gap-3">
        {(['LONG', 'SHORT'] as EntryDirection[]).map(option => {
          const isActive = direction === option;
          const activeClass = option === 'LONG' ? 'bg-[#26a69a] text-black' : 'bg-[#ef5350] text-black';
          return (
            <button
              key={option}
              type="button"
              onClick={() => onDirectionChange(option)}
              aria-pressed={isActive}
              className={cn(
                'rounded-xl py-4 text-2xl font-black tracking-wide transition-colors',
                isActive ? activeClass : 'border border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white'
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Verdict */}
      <div className="flex flex-col items-center gap-3">
        <span className={cn('text-7xl font-black leading-none tracking-tight', style.text)}>{style.word}</span>
        <span className="text-3xl font-bold text-white/85">
          {result.aligned} of {result.total} timeframes aligned
        </span>
      </div>

      {/* Disagreeing timeframes only */}
      <div className="min-h-[3rem]">
        {result.disagreeing.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {result.disagreeing.map(frame => (
              <span
                key={frame.timeframe}
                className="rounded-lg border border-[#ef5350]/40 bg-[#ef5350]/10 px-3 py-1.5 text-xl font-bold text-[#e57373]"
              >
                {frame.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xl font-bold text-[#4db6ac]">All timeframes agree</p>
        )}
      </div>

      {/* One short warning when the higher timeframes fight the trade */}
      {result.higherTimeframeWarning && (
        <p className="text-xl font-bold text-amber-400">Higher timeframes against</p>
      )}
    </div>
  );
};
