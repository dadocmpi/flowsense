// ============================================
// VOTE TABLE
// ============================================
// Every indicator's raw value and its vote, in one table. The vote word is
// derived from the same Vote value the score used, so the table and the gauge
// cannot disagree.

import React from 'react';
import type { VoteDetail } from '../../core/types';
import { voteTextColor, voteWord } from './format';
import { cn } from '@/lib/utils';

interface VoteTableProps {
  details: VoteDetail[];
  /** Column heading for the value, e.g. "Value" or "Level". */
  valueHeading?: string;
  emptyText?: string;
}

export const VoteTable: React.FC<VoteTableProps> = ({
  details,
  valueHeading = 'Value',
  emptyText = 'Not enough data',
}) => {
  if (details.length === 0) {
    return <p className="py-4 text-center text-body italic text-white/40">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-body">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-micro uppercase tracking-wider text-white/40">
            <th className="py-2 pr-2 font-semibold">Indicator</th>
            <th className="py-2 px-2 text-right font-semibold">{valueHeading}</th>
            <th className="py-2 pl-2 text-right font-semibold">Vote</th>
          </tr>
        </thead>
        <tbody>
          {details.map(detail => (
            <tr key={detail.name} className="border-b border-white/[0.04] last:border-0">
              <td className="py-2 pr-2 text-white/75">
                <span className="block truncate" title={detail.note ?? detail.name}>
                  {detail.name}
                </span>
                {detail.note && <span className="block text-micro text-white/35">{detail.note}</span>}
              </td>
              <td className="py-2 px-2 text-right font-mono text-white/90">{detail.display}</td>
              <td className={cn('py-2 pl-2 text-right font-bold', voteTextColor(detail.vote))}>
                {voteWord(detail.vote)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
