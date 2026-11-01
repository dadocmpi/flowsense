// ============================================
// TECHNICAL TABLE (merged)
// ============================================
// ONE table holding the moving averages and the oscillators: name, value and
// state. There is no second table — the two blocks are the left and right halves
// of the same <table>, laid out side by side so the whole read fits on a
// 1920x1080 screen without scrolling.
//
// The state word is derived from the same Vote the score used, so the table and
// the compass above it cannot disagree.

import React from 'react';
import type { VoteDetail } from '../../core/types';
import { voteTextColor, voteWord } from './format';
import { cn } from '@/lib/utils';

interface TechnicalTableProps {
  details: VoteDetail[];
  emptyText?: string;
}

/** The three cells one indicator contributes: name, value, state. */
function Cells({ detail, first }: { detail: VoteDetail | null; first: boolean }) {
  if (!detail) {
    // The two blocks can differ in length; the shorter one simply ends, exactly
    // as it did when the blocks were separate tables.
    return (
      <>
        <td className="py-[2px]" />
        <td className="py-[2px]" />
        <td className="py-[2px]" />
      </>
    );
  }

  return (
    <>
      <td className={cn('py-[2px] pr-2 text-micro text-white/75', !first && 'pl-6')}>
        <span className="block truncate" title={detail.note ?? detail.name}>
          {detail.name}
        </span>
      </td>
      <td className="py-[2px] px-2 text-right font-mono text-micro text-white/90">{detail.display}</td>
      <td className={cn('py-[2px] pl-2 text-right text-micro font-bold', voteTextColor(detail.vote))}>
        {voteWord(detail.vote)}
      </td>
    </>
  );
}

export const TechnicalTable: React.FC<TechnicalTableProps> = ({ details, emptyText = 'No data' }) => {
  if (details.length === 0) {
    return <p className="py-3 text-label italic text-white/40">{emptyText}</p>;
  }

  const movingAverages = details.filter(detail => detail.group === 'MA');
  const oscillators = details.filter(detail => detail.group !== 'MA');
  const rowCount = Math.max(movingAverages.length, oscillators.length);
  const rows = Array.from(
    { length: rowCount },
    (_, index) => [movingAverages[index] ?? null, oscillators[index] ?? null] as const
  );

  const groupHeading = 'pb-0.5 text-left text-micro font-semibold uppercase tracking-wider text-white/40';
  const columnHeading = 'py-0.5 text-micro font-semibold uppercase tracking-wider text-white/35';

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th colSpan={3} className={cn(groupHeading, 'pr-2')}>
            Moving averages
          </th>
          <th colSpan={3} className={cn(groupHeading, 'pl-6 pr-2')}>
            Oscillators
          </th>
        </tr>
        <tr className="border-b border-white/[0.08] text-left">
          <th className={cn(columnHeading, 'pr-2')}>Indicator</th>
          <th className={cn(columnHeading, 'px-2 text-right')}>Value</th>
          <th className={cn(columnHeading, 'pl-2 text-right')}>State</th>
          <th className={cn(columnHeading, 'pl-6 pr-2')}>Indicator</th>
          <th className={cn(columnHeading, 'px-2 text-right')}>Value</th>
          <th className={cn(columnHeading, 'pl-2 text-right')}>State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([movingAverage, oscillator], index) => (
          <tr
            key={`${movingAverage?.name ?? ''}|${oscillator?.name ?? ''}|${index}`}
            className="border-b border-white/[0.04] last:border-0"
          >
            <Cells detail={movingAverage} first />
            <Cells detail={oscillator} first={false} />
          </tr>
        ))}
      </tbody>
    </table>
  );
};
