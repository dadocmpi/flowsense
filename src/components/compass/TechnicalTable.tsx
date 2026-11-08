// ============================================
// INDICATOR DETAIL (merged technical table)
// ============================================
// ONE table holding the moving averages and the oscillators: name, value and
// state. There is no second table. The two blocks sit side by side so the whole
// read fits without scrolling.
//
// Institutional table rules: zebra-less, hairline row separators, a compact row
// height, right-aligned numeric columns in the mono font, sticky headers, and a
// state shown as a small consistent-width pill with a glyph so colour is never
// the only cue.
//
// The highest-value rows are shown first; the rest collapse into a "More"
// disclosure so the panel does not read as a wall of numbers. Nothing is hidden
// behind the disclosure that the compass above does not already summarise, and
// the disclosure is always available — it is a density control, not a show/hide
// of the primary data.
//
// The state word is derived from the same Vote the score used, so the table and
// the compass above it cannot disagree.

import React, { useMemo, useState } from 'react';
import type { VoteDetail } from '../../core/types';
import { voteTextColor, voteWord } from './format';
import { Pill, type PillTone } from '../common/Pill';
import { cn } from '@/lib/utils';

interface TechnicalTableProps {
  details: VoteDetail[];
  emptyText?: string;
}

const VOTE_TONE: Record<string, PillTone> = { BUY: 'buy', SELL: 'sell', NEUTRAL: 'neutral' };
const VOTE_GLYPH: Record<string, string> = { BUY: '▲', SELL: '▼', NEUTRAL: '—' };

/** The rows worth showing before the "More" disclosure, by indicator name. */
const PRIMARY_NAMES = new Set([
  'EMA 20',
  'EMA 50',
  'EMA 200',
  'SMA 50',
  'SMA 200',
  'RSI 14',
  'MACD',
  'MACD Signal',
  'Stochastic',
  'ADX 14',
  'CCI 20',
  'ATR 14',
]);

function Header({ title }: { title: string }) {
  return (
    <h4 className="mb-1 text-micro font-semibold uppercase tracking-[0.12em] text-ink-muted">{title}</h4>
  );
}

function Rows({ rows }: { rows: VoteDetail[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={3} className="py-2 text-label italic text-ink-muted">
          No data
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map(detail => (
        <tr key={detail.name} className="border-b border-hairline last:border-0">
          <td className="h-8 py-0 pr-2 text-label text-ink-secondary">
            <span className="block truncate" title={detail.note ?? detail.name}>
              {detail.name}
            </span>
          </td>
          <td data-numeric className="py-0 px-2 text-right font-mono text-label text-ink">
            {detail.display}
          </td>
          <td className="py-0 pl-2 text-right">
            <Pill tone={VOTE_TONE[detail.vote] ?? 'neutral'} glyph={VOTE_GLYPH[detail.vote]} className="w-[5.5rem] justify-center">
              {voteWord(detail.vote)}
            </Pill>
          </td>
        </tr>
      ))}
    </>
  );
}

export const TechnicalTable: React.FC<TechnicalTableProps> = ({ details, emptyText = 'No data' }) => {
  const [showMore, setShowMore] = useState(false);

  const { movingAverages, oscillators, hiddenCount } = useMemo(() => {
    const ma = details.filter(detail => detail.group === 'MA');
    const osc = details.filter(detail => detail.group !== 'MA');
    const primary = details.filter(detail => PRIMARY_NAMES.has(detail.name));
    return {
      movingAverages: ma,
      oscillators: osc,
      hiddenCount: details.length - primary.length,
    };
  }, [details]);

  if (details.length === 0) {
    return <p className="py-3 text-label italic text-ink-muted">{emptyText}</p>;
  }

  const visible = (rows: VoteDetail[]) => (showMore ? rows : rows.filter(row => PRIMARY_NAMES.has(row.name)));
  const visibleMa = visible(movingAverages);
  const visibleOsc = visible(oscillators);

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
        <div>
          <Header title="Moving averages" />
          <table className="w-full border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-hairline-strong bg-surface text-left text-micro uppercase tracking-[0.08em] text-ink-muted">
                <th className="py-1.5 pr-2 font-semibold">Indicator</th>
                <th className="py-1.5 px-2 text-right font-semibold">Value</th>
                <th className="py-1.5 pl-2 text-right font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              <Rows rows={visibleMa} />
            </tbody>
          </table>
        </div>

        <div>
          <Header title="Oscillators" />
          <table className="w-full border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-hairline-strong bg-surface text-left text-micro uppercase tracking-[0.08em] text-ink-muted">
                <th className="py-1.5 pr-2 font-semibold">Indicator</th>
                <th className="py-1.5 px-2 text-right font-semibold">Value</th>
                <th className="py-1.5 pl-2 text-right font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              <Rows rows={visibleOsc} />
            </tbody>
          </table>
        </div>
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowMore(value => !value)}
          aria-expanded={showMore}
          className={cn(
            'mt-2 self-start rounded-md border border-hairline px-2.5 py-1 text-micro font-medium uppercase tracking-[0.08em]',
            'text-ink-muted transition-colors duration-150 hover:bg-elevated hover:text-ink-secondary'
          )}
        >
          {showMore ? 'Show fewer' : `More (${hiddenCount})`}
        </button>
      )}
    </div>
  );
};
