// ============================================
// ENTRY CHECK PANEL
// ============================================
// The actionable read: pick LONG or SHORT and see whether the three compasses of
// the SELECTED timeframe back it. Every number shown here comes from checkEntry
// in core/entryCheck, so the panel cannot disagree with the compasses above it.
//
// The chip row fills from every timeframe the store has loaded, each with the age
// of its last reading. A timeframe that has not loaded says "Not loaded" — it is
// never fetched to fill a chip.
//
// A timeframe whose market is CLOSED (a US-equity asset outside the regular
// session, whose newest bar legitimately stays at the last close) is labelled
// "Market closed" and EXCLUDED from the timeframe-level agreement figure, with a
// note saying so. It is never shown as a disagreement and never drags the
// percentage down.

import React from 'react';
import type { EntryCheckResult, EntryDirection } from '../../core/entryCheck';
import { verdictWord } from '../../core/entryCheck';
import type { ScoreLabel, Timeframe } from '../../core/types';
import { TIMEFRAME_LABELS } from '../../core/types';
import { formatAge, labelShort } from './format';
import { cn } from '@/lib/utils';

/** One timeframe's stored summary reading, or null when it is not loaded. */
export interface EntryChip {
  timeframe: Timeframe;
  scoreLabel: ScoreLabel | null;
  updatedAt: number | null;
  /** True when this timeframe's market is closed, so its reading is the last close. */
  marketClosed?: boolean;
  /** Why it is closed, for the tooltip. */
  marketReason?: string;
}

interface EntryCheckPanelProps {
  result: EntryCheckResult;
  direction: EntryDirection;
  onDirectionChange: (direction: EntryDirection) => void;
  chips: EntryChip[];
  /** Epoch ms, for the chip ages. */
  now: number;
  /** Name of the timeframe the verdict was computed for. */
  timeframeLabel: string;
}

const VERDICT_STYLE: Record<EntryCheckResult['verdict'], { text: string; ring: string }> = {
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
  UNAVAILABLE: 'No reading',
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
  result,
  direction,
  onDirectionChange,
  chips,
  now,
  timeframeLabel,
}) => {
  const style = VERDICT_STYLE[result.verdict];

  // Timeframe-level agreement, measured ONLY across timeframes that are loaded,
  // have a reading, and whose market is open. Market-closed timeframes are
  // excluded, not counted as disagreement, so a closed market never reads as a
  // signal against the trade.
  const closedChips = chips.filter(chip => chip.marketClosed);
  const directional = chips.filter(
    chip => chip.scoreLabel !== null && !chip.marketClosed && chipStance(chip.scoreLabel, direction) !== 'NEUTRAL'
  );
  const agreeing = directional.filter(chip => chipStance(chip.scoreLabel!, direction) === 'AGREE');
  const timeframeShare = directional.length === 0 ? null : agreeing.length / directional.length;

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
        <span className="text-label text-white/40">against the three compasses on {timeframeLabel}</span>
      </div>

      {/* Verdict */}
      <div className={cn('rounded-xl border px-4 py-3', style.ring)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-3">
            <span className={cn('text-title font-black leading-none', style.text)}>{verdictWord(result.verdict)}</span>
            <span className="text-label text-white/50">
              {result.aligned} agree · {result.opposing} disagree · {result.neutral} neutral
              {result.unavailable > 0 && ` · ${result.unavailable} no reading`}
            </span>
          </div>
          <span className="font-mono text-label text-white/60">{Math.round(result.share * 100)}% agree</span>
        </div>

        <p className="mt-1.5 text-body text-white/75">{result.message}</p>

        {/* Timeframe-level agreement, excluding market-closed timeframes. */}
        {timeframeShare !== null ? (
          <p className="mt-1 text-label text-white/50">
            Across loaded timeframes: {agreeing.length} of {directional.length} agree ({Math.round(timeframeShare * 100)}%)
            {closedChips.length > 0 && ` · ${closedChips.length} excluded (market closed)`}
          </p>
        ) : (
          closedChips.length > 0 && (
            <p className="mt-1 text-label text-white/50">
              Across loaded timeframes: no open market to compare — {closedChips.length} market closed
            </p>
          )
        )}
      </div>

      {/* Per-timeframe chips, filled only from what is loaded */}
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => {
          const label = TIMEFRAME_LABELS[chip.timeframe] ?? chip.timeframe;

          if (chip.marketClosed) {
            return (
              <div
                key={chip.timeframe}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-1.5"
                title={chip.marketReason ?? 'The market is closed; the last candle is the last close.'}
              >
                <span className="text-label font-bold text-amber-300/90">{label}</span>
                <span className="text-micro text-amber-300/70">Market closed</span>
                <span className="text-[0.5625rem] uppercase tracking-wide text-white/35">
                  {formatAge(chip.updatedAt, now)}
                </span>
              </div>
            );
          }

          if (!chip.scoreLabel || chip.updatedAt === null) {
            return (
              <div
                key={chip.timeframe}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-white/[0.06] bg-transparent px-3 py-1.5"
                title="Not loaded in this session"
              >
                <span className="text-label font-bold text-white/30">{label}</span>
                <span className="text-micro text-white/25">Not loaded</span>
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
