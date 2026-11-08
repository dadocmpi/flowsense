// ============================================
// ENTRY CHECK PANEL
// ============================================
// The actionable read: pick LONG or SHORT and see whether the three compasses of
// the selected timeframe back it. Every number comes from checkEntry, so the
// panel cannot disagree with the compasses above it.
//
// A market-closed timeframe is labelled and EXCLUDED from the timeframe-level
// agreement figure, never counted as a disagreement.

import React from 'react';
import type { EntryCheckResult, EntryDirection } from '../../core/entryCheck';
import { verdictWord } from '../../core/entryCheck';
import type { ScoreLabel, Timeframe } from '../../core/types';
import { TIMEFRAME_LABELS } from '../../core/types';
import { labelShort, labelColor } from './format';
import { PALETTE } from '../common/palette';
import { cn } from '@/lib/utils';

export interface EntryChip {
  timeframe: Timeframe;
  scoreLabel: ScoreLabel | null;
  updatedAt: number | null;
  marketClosed?: boolean;
  marketReason?: string;
}

interface EntryCheckPanelProps {
  result: EntryCheckResult;
  direction: EntryDirection;
  onDirectionChange: (direction: EntryDirection) => void;
  chips: EntryChip[];
  timeframeLabel: string;
}

const VERDICT_COLOR: Record<EntryCheckResult['verdict'], string> = {
  ALIGNED: PALETTE.pos,
  MIXED: PALETTE.warn,
  AGAINST: PALETTE.neg,
};

const STANCE_STYLE: Record<string, string> = {
  AGREE: 'border-pos/40 bg-pos/[0.07] text-pos',
  DISAGREE: 'border-neg/40 bg-neg/[0.07] text-neg',
  NEUTRAL: 'border-line bg-base-2 text-ink-muted',
  UNAVAILABLE: 'border-line bg-transparent text-ink-subtle/70',
};

const STANCE_WORD: Record<string, string> = {
  AGREE: 'Agrees',
  DISAGREE: 'Disagrees',
  NEUTRAL: 'Neutral',
  UNAVAILABLE: 'No reading',
};

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
  timeframeLabel,
}) => {
  const color = VERDICT_COLOR[result.verdict];

  const closedChips = chips.filter(chip => chip.marketClosed);
  const directional = chips.filter(
    chip => chip.scoreLabel !== null && !chip.marketClosed && chipStance(chip.scoreLabel, direction) !== 'NEUTRAL'
  );
  const agreeing = directional.filter(chip => chipStance(chip.scoreLabel!, direction) === 'AGREE');
  const timeframeShare = directional.length === 0 ? null : agreeing.length / directional.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-micro uppercase tracking-[0.06em] text-ink-subtle">Checking a</span>
        <div className="inline-flex overflow-hidden rounded-sm border border-line" role="group">
          {(['LONG', 'SHORT'] as EntryDirection[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => onDirectionChange(option)}
              aria-pressed={direction === option}
              className={cn(
                'px-3 py-1 font-mono text-label font-medium transition-colors',
                direction === option
                  ? option === 'LONG'
                    ? 'bg-pos/20 text-pos'
                    : 'bg-neg/20 text-neg'
                  : 'bg-base-1 text-ink-subtle hover:text-ink'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-label text-ink-subtle">against the three compasses on {timeframeLabel}</span>
      </div>

      <div className="rounded-sm border border-line bg-base-2 px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-3">
            <span className="text-title font-semibold" style={{ color }}>
              {verdictWord(result.verdict)}
            </span>
            <span className="text-label text-ink-subtle">
              {result.aligned} agree · {result.opposing} disagree · {result.neutral} neutral
              {result.unavailable > 0 && ` · ${result.unavailable} no reading`}
            </span>
          </div>
          <span className="font-mono text-label tabular text-ink-muted">{Math.round(result.share * 100)}% agree</span>
        </div>

        <p className="mt-1.5 text-body text-ink-muted">{result.message}</p>

        {timeframeShare !== null ? (
          <p className="mt-1 text-label text-ink-subtle">
            Across loaded timeframes: {agreeing.length} of {directional.length} agree ({Math.round(timeframeShare * 100)}%)
            {closedChips.length > 0 && ` · ${closedChips.length} excluded (market closed)`}
          </p>
        ) : (
          closedChips.length > 0 && (
            <p className="mt-1 text-label text-ink-subtle">
              Across loaded timeframes: no open market to compare — {closedChips.length} market closed
            </p>
          )
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map(chip => {
          const label = TIMEFRAME_LABELS[chip.timeframe] ?? chip.timeframe;

          if (chip.marketClosed) {
            return (
              <div
                key={chip.timeframe}
                className="flex flex-col items-center gap-0.5 rounded-sm border border-warn/30 bg-warn/[0.06] px-2.5 py-1"
                title={chip.marketReason ?? 'The market is closed; the last candle is the last close.'}
              >
                <span className="font-mono text-label font-medium text-warn">{label}</span>
                <span className="text-micro text-warn/80">Market closed</span>
              </div>
            );
          }

          if (!chip.scoreLabel || chip.updatedAt === null) {
            return (
              <div
                key={chip.timeframe}
                className="flex flex-col items-center gap-0.5 rounded-sm border border-line bg-transparent px-2.5 py-1"
                title="Not loaded in this session"
              >
                <span className="font-mono text-label font-medium text-ink-subtle/70">{label}</span>
                <span className="text-micro text-ink-subtle/60">Not loaded</span>
              </div>
            );
          }

          const stance = chipStance(chip.scoreLabel, direction);
          return (
            <div
              key={chip.timeframe}
              className={cn('flex flex-col items-center gap-0.5 rounded-sm border px-2.5 py-1', STANCE_STYLE[stance])}
            >
              <span className="font-mono text-label font-medium">{label}</span>
              <span className="text-micro" style={{ color: labelColor(chip.scoreLabel) }}>
                {labelShort(chip.scoreLabel)} · {STANCE_WORD[stance]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
