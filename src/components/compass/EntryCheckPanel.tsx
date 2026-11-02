// ============================================
// ENTRY CHECK PANEL
// ============================================
// The actionable read: pick LONG or SHORT and see whether the three compasses of
// the SELECTED timeframe back it. Every number shown here comes from checkEntry
// in core/entryCheck, so the panel cannot disagree with the compasses above it.
//
// The chip row shows EVERY timeframe, filled as each one arrives. A timeframe
// whose data is still on its way reads "Loading"; one the credit window blocked
// reads "Waiting for credits"; a permanent failure reads "No data". Those are
// different facts and the panel keeps them apart.

import React from 'react';
import type { ConfluenceResult, EntryDirection } from '../../core/entryCheck';
import { verdictWord } from '../../core/entryCheck';
import type { ScoreLabel, Timeframe } from '../../core/types';
import { TIMEFRAME_LABELS } from '../../core/types';
import { formatAge, labelShort } from './format';
import { cn } from '@/lib/utils';

/** How far a timeframe's chip has got. */
export type ChipState = 'LOADING' | 'WAITING' | 'READY' | 'NO_DATA';

/** One timeframe's stored summary reading, or the reason there is none yet. */
export interface EntryChip {
  timeframe: Timeframe;
  state: ChipState;
  scoreLabel: ScoreLabel | null;
  updatedAt: number | null;
}

interface EntryCheckPanelProps {
  /** The multi-timeframe read: one vote per loaded timeframe. */
  confluence: ConfluenceResult;
  direction: EntryDirection;
  onDirectionChange: (direction: EntryDirection) => void;
  chips: EntryChip[];
  /** Epoch ms, for the chip ages. */
  now: number;
}

const VERDICT_STYLE: Record<ConfluenceResult['verdict'], { text: string; ring: string }> = {
  ALIGNED: { text: 'text-[#26a69a]', ring: 'border-[#26a69a]/40 bg-[#26a69a]/10' },
  MIXED: { text: 'text-amber-400', ring: 'border-amber-500/40 bg-amber-500/10' },
  AGAINST: { text: 'text-[#ef5350]', ring: 'border-[#ef5350]/40 bg-[#ef5350]/10' },
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

/** Which way a stored reading points relative to the chosen direction. */
function chipStance(label: ScoreLabel, direction: EntryDirection): 'AGREE' | 'DISAGREE' | 'NEUTRAL' {
  const bullish = label === 'BUY' || label === 'STRONG_BUY';
  const bearish = label === 'SELL' || label === 'STRONG_SELL';
  if (!bullish && !bearish) return 'NEUTRAL';
  const agrees = direction === 'LONG' ? bullish : bearish;
  return agrees ? 'AGREE' : 'DISAGREE';
}

export const EntryCheckPanel: React.FC<EntryCheckPanelProps> = ({
  confluence,
  direction,
  onDirectionChange,
  chips,
  now,
}) => {
  const style = VERDICT_STYLE[confluence.verdict];

  return (
    <div className="space-y-3">
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
        <span className="text-label text-white/40">across all timeframes</span>
      </div>

      {/* Verdict, from the loaded timeframes only */}
      <div className={cn('rounded-xl border px-4 py-3', style.ring)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-3">
            <span className={cn('text-title font-black leading-none', style.text)}>
              {verdictWord(confluence.verdict)}
            </span>
            <span className="text-label text-white/50">
              {confluence.agree} agree · {confluence.disagree} disagree · {confluence.neutral} neutral
              {confluence.pending > 0 && ` · ${confluence.pending} loading`}
            </span>
          </div>
          <span className="font-mono text-label text-white/60">{Math.round(confluence.share * 100)}% agree</span>
        </div>

        <p className="mt-1.5 text-body text-white/75">{confluence.message}</p>
      </div>

      {/* Per-timeframe chips, filled as each timeframe arrives */}
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => {
          const label = TIMEFRAME_LABELS[chip.timeframe] ?? chip.timeframe;

          if (chip.state !== 'READY' || !chip.scoreLabel || chip.updatedAt === null) {
            const word =
              chip.state === 'LOADING'
                ? 'Loading'
                : chip.state === 'WAITING'
                  ? 'Waiting for credits'
                  : 'No data';
            const tone =
              chip.state === 'WAITING'
                ? 'text-amber-400'
                : chip.state === 'NO_DATA'
                  ? 'text-white/40'
                  : 'text-white/30';
            return (
              <div
                key={chip.timeframe}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-white/[0.06] bg-transparent px-3 py-1.5"
                title={word}
              >
                <span className={cn('text-label font-bold', tone)}>{label}</span>
                <span className={cn('text-micro', tone)}>{word}</span>
              </div>
            );
          }

          const stance = chipStance(chip.scoreLabel, direction);
          return (
            <div
              key={chip.timeframe}
              className={cn('flex flex-col items-center gap-0.5 rounded-lg border px-3 py-1.5', STANCE_STYLE[stance])}
            >
              <span className="text-label font-bold">{label}</span>
              <span className="text-micro">
                {labelShort(chip.scoreLabel)} · {STANCE_WORD[stance]}
              </span>
              <span className="text-[0.5625rem] uppercase tracking-wide text-white/35">
                {formatAge(chip.updatedAt, now)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
