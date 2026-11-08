// ============================================
// TECHNICAL TABLE (merged)
// ============================================
// ONE table holding the moving averages and the oscillators: name, value, state.
// The state word comes from the same Vote the score used, so the table and the
// compass above it cannot disagree.
//
// VISIBILITY IS COSMETIC. Rows whose id is hidden in src/config/indicators.ts
// are not rendered — but the indicator still votes and still feeds the Compass
// and the Summary. The hidden rows are listed in the "Compass inputs" drawer.

import React from 'react';
import type { VoteDetail } from '../../core/types';
import { voteColor, voteWord } from './format';

interface TechnicalTableProps {
  details: VoteDetail[];
  emptyText?: string;
}

function Rows({ rows }: { rows: VoteDetail[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={3} className="py-2 text-label text-ink-subtle">
          No data
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map(detail => (
        <tr key={detail.name} className="border-b border-line/50 last:border-0">
          <td className="py-[2px] pr-2 text-micro text-ink-muted">
            <span className="block truncate" title={detail.note ?? detail.name}>
              {detail.name}
            </span>
          </td>
          <td className="px-2 py-[2px] text-right font-mono text-micro tabular text-ink">{detail.display}</td>
          <td className="py-[2px] pl-2 text-right text-micro font-medium" style={{ color: voteColor(detail.vote) }}>
            {voteWord(detail.vote)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Block({ title, rows }: { title: string; rows: VoteDetail[] }) {
  return (
    <div>
      <h4 className="mb-0.5 text-micro font-semibold uppercase tracking-[0.08em] text-ink-subtle">{title}</h4>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line text-left text-micro uppercase tracking-[0.06em] text-ink-subtle">
            <th className="py-0.5 pr-2 font-medium">Indicator</th>
            <th className="px-2 py-0.5 text-right font-medium">Value</th>
            <th className="py-0.5 pl-2 text-right font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          <Rows rows={rows} />
        </tbody>
      </table>
    </div>
  );
}

export const TechnicalTable: React.FC<TechnicalTableProps> = ({ details, emptyText = 'No data' }) => {
  if (details.length === 0) {
    return <p className="py-3 text-label text-ink-subtle">{emptyText}</p>;
  }

  const movingAverages = details.filter(detail => detail.group === 'MA');
  const oscillators = details.filter(detail => detail.group !== 'MA' && detail.group !== 'ORDER_FLOW');

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
      <Block title="Moving averages" rows={movingAverages} />
      <Block title="Oscillators" rows={oscillators} />
    </div>
  );
};
