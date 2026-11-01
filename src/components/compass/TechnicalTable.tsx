// ============================================
// TECHNICAL TABLE (merged)
// ============================================
// ONE table holding the moving averages and the oscillators: name, value and
// state. There is no second table, and the two blocks are laid out side by side
// so the whole read fits without scrolling.
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

function Rows({ rows }: { rows: VoteDetail[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={3} className="py-2 text-label italic text-white/35">
          No data
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map(detail => (
        <tr key={detail.name} className="border-b border-white/[0.04] last:border-0">
          <td className="py-[2px] pr-2 text-micro text-white/75">
            <span className="block truncate" title={detail.note ?? detail.name}>
              {detail.name}
            </span>
          </td>
          <td className="py-[2px] px-2 text-right font-mono text-micro text-white/90">{detail.display}</td>
          <td className={cn('py-[2px] pl-2 text-right text-micro font-bold', voteTextColor(detail.vote))}>
            {voteWord(detail.vote)}
          </td>
        </tr>
      ))}
    </>
  );
}

export const TechnicalTable: React.FC<TechnicalTableProps> = ({ details, emptyText = 'No data' }) => {
  if (details.length === 0) {
    return <p className="py-3 text-label italic text-white/40">{emptyText}</p>;
  }

  const movingAverages = details.filter(detail => detail.group === 'MA');
  const oscillators = details.filter(detail => detail.group !== 'MA');

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
      <div>
        <h4 className="text-micro font-semibold uppercase tracking-wider text-white/40">Moving averages</h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-micro uppercase tracking-wider text-white/35">
              <th className="py-0.5 pr-2 font-semibold">Indicator</th>
              <th className="py-0.5 px-2 text-right font-semibold">Value</th>
              <th className="py-0.5 pl-2 text-right font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            <Rows rows={movingAverages} />
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-micro font-semibold uppercase tracking-wider text-white/40">Oscillators</h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-micro uppercase tracking-wider text-white/35">
              <th className="py-0.5 pr-2 font-semibold">Indicator</th>
              <th className="py-0.5 px-2 text-right font-semibold">Value</th>
              <th className="py-0.5 pl-2 text-right font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            <Rows rows={oscillators} />
          </tbody>
        </table>
      </div>
    </div>
  );
};
