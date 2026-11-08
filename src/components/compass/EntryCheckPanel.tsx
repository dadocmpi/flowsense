// ============================================
// ENTRY CHECK PANEL
// ============================================
// The actionable read: pick LONG or SHORT and see whether the three compasses of
// the SELECTED timeframe back it. Every number shown here comes from checkEntry
// in core/entryCheck, so the panel cannot disagree with the compasses above it.
//
// The panel is a flex column that fills its card: the header, the direction
// switch, the verdict box, the explanation and the timeframe tiles are spread
// with even spacing on the app's spacing scale, so nothing is squeezed at the
// top. The tiles fill the remaining space and wrap cleanly at every width.
//
// A timeframe whose market is CLOSED is labelled "Market closed" and EXCLUDED
// from the timeframe-level agreement figure, with a note saying so. It is never
// shown as a disagreement.

import React from 'react';
import type { EntryCheckResult, EntryDirection } from '../../core/entryCheck';
import { verdictWord } from '../../core/entryCheck';
import type { ScoreLabel, Timeframe } from '../../core/types';
import { TIMEFRAME_LABELS } from '../../core/types';
import { labelShort } from './format';
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
  /** True when the venue's order-flow reading agrees with the checked direction. */
  flowStance?: 'AGREE' | 'DISAGREE' | 'NEUTRAL' | null;
}

interface EntryCheckPanelProps {
  result: EntryCheckResult;
  direction: EntryDirection;
  onDirectionChange: (direction: EntryDirection) => void;
  chips: EntryChip[];
  /** Name of the timeframe the verdict was computed for. */
  timeframeLabel: string;
  /** The real order-flow stance against the checked direction, or null when absent. */
  flowStance?: 'AGREE' | 'DISAGREE' | 'NEUTRAL' | null;
}

const VERDICT_STYLE: Record<EntryCheckResult['verdict'], { text: string; ring: string; glyph: string }> = {
  ALIGNED: { text: 'text-buy', ring: 'border-buy-border bg-buy-soft', glyph: '▲' },
  MIXED: { text: 'text-ink-secondary', ring: 'border-hairline-strong bg-flat-soft', glyph: '●' },
  AGAINST: { text: 'text-sell', ring: 'border-sell-border bg-sell-soft', glyph: '▼' },
};

const STANCE_STYLE: Record<string, string> = {
  AGREE: 'border-buy-border bg-buy-soft text-buy',
  DISAGREE: 'border-sell-border bg-sell-soft text-sell',
  NEUTRAL: 'border-hairline bg-flat-soft text-ink-secondary',
  UNAVAILABLE: 'border-hairline bg-transparent text-ink-faint',
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
  timeframeLabel,
  flowStance,
}) => {
  const style = VERDICT_STYLE[result.verdict];

  // Timeframe-level agreement, measured ONLY across timeframes that are loaded,
  // have a reading, and whose market is open. Market-closed timeframes are
  // excluded, not counted as disagreement.
  const closedChips = chips.filter(chip => chip.marketClosed);
  const directional = chips.filter(
    chip => chip.scoreLabel !== null && !chip.marketClosed && chipStance(chip.scoreLabel, direction) !== 'NEUTRAL'
  );
  const agreeing = directional.filter(chip => chipStance(chip.scoreLabel!, direction) === 'AGREE');
  const timeframeShare = directional.length === 0 ? null : agreeing.length / directional.length;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Direction switch */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-muted">Checking a</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-hairline">
          {(['LONG', 'SHORT'] as EntryDirection[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => onDirectionChange(option)}
              aria-pressed={direction === option}
              className={cn(
                'px-4 py-1.5 text-label font-semibold transition-colors duration-150',
                direction === option
                  ? option === 'LONG'
                    ? 'bg-buy text-app'
                    : 'bg-sell text-app'
                  : 'bg-inset text-ink-muted hover:bg-elevated hover:text-ink-secondary'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-label text-ink-muted">on {timeframeLabel}</span>
      </div>

      {/* Verdict */}
      <div className={cn('rounded-xl border px-4 py-4', style.ring)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-3">
            <span aria-hidden className={cn('text-title', style.text)}>
              {style.glyph}
            </span>
            <span className={cn('text-title font-semibold leading-none', style.text)}>{verdictWord(result.verdict)}</span>
          </div>
          <span data-numeric className="font-mono text-label text-ink-secondary">
            {Math.round(result.share * 100)}% agree
          </span>
        </div>

        <p className="mt-3 text-body text-ink-secondary">{result.message}</p>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-label text-ink-muted">
          <span data-numeric>{result.aligned} agree</span>
          <span aria-hidden className="text-ink-faint">·</span>
          <span data-numeric>{result.opposing} disagree</span>
          <span aria-hidden className="text-ink-faint">·</span>
          <span data-numeric>{result.neutral} neutral</span>
          {result.unavailable > 0 && (
            <>
              <span aria-hidden className="text-ink-faint">·</span>
              <span data-numeric>{result.unavailable} no reading</span>
            </>
          )}
        </div>

        {/* Order-flow confirmation, when the venue has a real reading. */}
        {flowStance && flowStance !== 'NEUTRAL' && (
          <p className="mt-2 text-label text-ink-muted">
            Order flow:{' '}
            <span className={flowStance === 'AGREE' ? 'text-buy' : 'text-sell'}>
              {flowStance === 'AGREE' ? 'with' : 'against'} the {direction.toLowerCase()}
            </span>
          </p>
        )}

        {/* Timeframe-level agreement, excluding market-closed timeframes. */}
        {timeframeShare !== null ? (
          <p className="mt-1 text-label text-ink-muted">
            Across loaded timeframes: {agreeing.length} of {directional.length} agree (
            {Math.round(timeframeShare * 100)}%)
            {closedChips.length > 0 && ` · ${closedChips.length} excluded (market closed)`}
          </p>
        ) : (
          closedChips.length > 0 && (
            <p className="mt-1 text-label text-ink-muted">
              Across loaded timeframes: no open market to compare — {closedChips.length} market closed
            </p>
          )
        )}
      </div>

      {/* Per-timeframe tiles, filled only from what is loaded. They take the
          remaining height so the card fills evenly. */}
      <div className="flex flex-1 flex-wrap content-start gap-2">
        {chips.map(chip => {
          const label = TIMEFRAME_LABELS[chip.timeframe] ?? chip.timeframe;

          if (chip.marketClosed) {
            return (
              <div
                key={chip.timeframe}
                className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-lg border border-warn-border bg-warn-soft px-3 py-2"
                title={chip.marketReason ?? 'The market is closed; the last candle is the last close.'}
              >
                <span className="text-label font-semibold text-warn">{label}</span>
                <span className="text-micro text-warn/80">Market closed</span>
              </div>
            );
          }

          if (!chip.scoreLabel || chip.updatedAt === null) {
            return (
              <div
                key={chip.timeframe}
                className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-lg border border-hairline bg-transparent px-3 py-2"
                title="Not loaded in this session"
              >
                <span className="text-label font-semibold text-ink-faint">{label}</span>
                <span className="text-micro text-ink-faint">Not loaded</span>
              </div>
            );
          }

          const stance = chipStance(chip.scoreLabel, direction);
          const glyph = stance === 'AGREE' ? '▲' : stance === 'DISAGREE' ? '▼' : '—';
          return (
            <div
              key={chip.timeframe}
              className={cn('flex min-w-[5.5rem] flex-col items-center gap-1 rounded-lg border px-3 py-2', STANCE_STYLE[stance])}
            >
              <span className="text-label font-semibold">{label}</span>
              <span className="flex items-center gap-1 text-micro">
                <span aria-hidden>{glyph}</span>
                {labelShort(chip.scoreLabel)} · {STANCE_WORD[stance]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
