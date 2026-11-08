// ============================================
// TREND SUMMARY STRIP
// ============================================
// The multi-timeframe picture in one row: one small cell per timeframe (M1 -> 1D)
// coloured by that timeframe's SUMMARY compass label, so a trader sees the trend
// alignment at a glance.
//
// The values are the EXISTING compass results per timeframe, read from the same
// store the chips use — nothing is recomputed differently here. A timeframe that
// is not loaded, or whose market is closed, is shown honestly (muted / "closed")
// and never given a colour that implies a signal it does not have.

import React from 'react';
import type { ScoreLabel, Timeframe } from '../../core/types';
import { TIMEFRAMES, TIMEFRAME_LABELS } from '../../core/types';
import { labelShort } from './format';
import { cn } from '@/lib/utils';

export interface TrendCell {
  timeframe: Timeframe;
  scoreLabel: ScoreLabel | null;
  /** True when this timeframe's market is closed. */
  marketClosed?: boolean;
  /** True when the timeframe has not loaded at all. */
  notLoaded?: boolean;
  /** The compass score, for the tooltip. */
  score?: number | null;
}

interface TrendSummaryStripProps {
  cells: TrendCell[];
  className?: string;
}

const TONE: Record<ScoreLabel, string> = {
  STRONG_BUY: 'border-buy-border bg-buy/25 text-buy',
  BUY: 'border-buy-border bg-buy-soft text-buy',
  NEUTRAL: 'border-hairline bg-flat-soft text-ink-secondary',
  SELL: 'border-sell-border bg-sell-soft text-sell',
  STRONG_SELL: 'border-sell-border bg-sell/25 text-sell',
};

const GLYPH: Record<ScoreLabel, string> = {
  STRONG_BUY: '▲',
  BUY: '▲',
  NEUTRAL: '—',
  SELL: '▼',
  STRONG_SELL: '▼',
};

export const TrendSummaryStrip: React.FC<TrendSummaryStripProps> = ({ cells, className }) => {
  const byTimeframe = new Map(cells.map(cell => [cell.timeframe, cell]));

  return (
    <div className={cn('flex flex-wrap items-stretch gap-1.5', className)}>
      {TIMEFRAMES.map(timeframe => {
        const cell = byTimeframe.get(timeframe);
        const label = TIMEFRAME_LABELS[timeframe] ?? timeframe;

        if (!cell || cell.notLoaded || !cell.scoreLabel) {
          return (
            <div
              key={timeframe}
              className="flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-md border border-hairline bg-transparent px-2 py-1"
              title={`${label} — not loaded`}
            >
              <span className="text-micro font-semibold text-ink-faint">{label}</span>
              <span className="text-micro text-ink-faint">--</span>
            </div>
          );
        }

        if (cell.marketClosed) {
          return (
            <div
              key={timeframe}
              className="flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-md border border-warn-border bg-warn-soft px-2 py-1"
              title={`${label} — market closed`}
            >
              <span className="text-micro font-semibold text-warn">{label}</span>
              <span className="text-micro text-warn/80">closed</span>
            </div>
          );
        }

        return (
          <div
            key={timeframe}
            className={cn('flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-md border px-2 py-1', TONE[cell.scoreLabel])}
            title={`${label} — ${labelShort(cell.scoreLabel)}${
              cell.score != null ? ` (${Math.round(cell.score)})` : ''
            }`}
          >
            <span className="text-micro font-semibold opacity-80">{label}</span>
            <span className="flex items-center gap-0.5 text-micro font-medium">
              <span aria-hidden>{GLYPH[cell.scoreLabel]}</span>
              {labelShort(cell.scoreLabel)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
