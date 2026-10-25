// ============================================
// SIGNAL HISTORY PANEL
// ============================================
// The signal history, with both reported bugs fixed and made visible:
//
//  * the label column is read straight from the entry, and the entry's label
//    is derived from its score, so a positive score can never show "Sell"
//  * rows carry a full date and are ordered newest-first by timestamp, with a
//    sequence number breaking ties, so they cannot appear out of order
//  * the table only ever shows the selected instrument and timeframe, so two
//    series can never be interleaved in one list

import React, { useMemo, useState } from 'react';
import type { SignalHistoryEntry } from '../../core/history';
import type { Timeframe } from '../../core/types';
import { entriesForKey } from '../../core/history';
import { labelShort, labelTextColor, formatNumber, formatDateTime } from './format';
import { cn } from '@/lib/utils';

interface SignalHistoryPanelProps {
  history: SignalHistoryEntry[];
  instrumentId: string;
  timeframe: Timeframe;
  precision: number;
}

type Filter = 'all' | 'buy' | 'sell';

const PAGE_SIZE = 25;

export const SignalHistoryPanel: React.FC<SignalHistoryPanelProps> = ({
  history,
  instrumentId,
  timeframe,
  precision,
}) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const rows = useMemo(() => {
    // Scoped to one instrument and one timeframe, newest first.
    const scoped = entriesForKey(history, { instrumentId, timeframe }, 500);
    if (filter === 'all') return scoped;
    return scoped.filter(entry => {
      const bullish = entry.label === 'BUY' || entry.label === 'STRONG_BUY';
      const bearish = entry.label === 'SELL' || entry.label === 'STRONG_SELL';
      return filter === 'buy' ? bullish : bearish;
    });
  }, [history, instrumentId, timeframe, filter]);

  const visible = rows.slice(0, limit);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-label text-white/45">
          {rows.length} reading{rows.length === 1 ? '' : 's'} for {instrumentId} on {timeframe}, newest first.
        </p>
        <div className="flex items-center gap-1">
          {(['all', 'buy', 'sell'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
                setLimit(PAGE_SIZE);
              }}
              className={cn(
                'rounded-md px-2.5 py-1 text-label font-semibold capitalize transition-colors',
                filter === value ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-body italic text-white/40">
          No readings recorded for {instrumentId} on {timeframe} yet.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-body">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-micro uppercase tracking-wider text-white/40">
                  <th className="py-2 pr-2 font-semibold">Date</th>
                  <th className="py-2 px-2 font-semibold">Time</th>
                  <th className="py-2 px-2 text-right font-semibold">Score</th>
                  <th className="py-2 px-2 text-right font-semibold">Signal</th>
                  <th className="py-2 pl-2 text-right font-semibold">Price</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(entry => (
                  <tr key={`${entry.seq}-${entry.timestamp}`} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2 pr-2 font-mono text-white/60">{entry.date}</td>
                    <td className="py-2 px-2 font-mono text-white/60">{entry.time}</td>
                    <td
                      className={cn(
                        'py-2 px-2 text-right font-mono font-bold',
                        entry.score > 0 ? 'text-[#4db6ac]' : entry.score < 0 ? 'text-[#e57373]' : 'text-amber-400'
                      )}
                    >
                      {entry.score > 0 ? '+' : ''}
                      {Math.round(entry.score)}
                    </td>
                    <td className={cn('py-2 px-2 text-right font-bold', labelTextColor(entry.label))}>
                      {labelShort(entry.label)}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono text-white/80">
                      {formatNumber(entry.price, precision)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > visible.length && (
            <button
              type="button"
              onClick={() => setLimit(current => current + PAGE_SIZE)}
              className="mt-3 w-full rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 text-label font-semibold text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              Show older readings ({rows.length - visible.length} more)
            </button>
          )}
        </>
      )}

      <p className="mt-3 text-micro text-white/30">
        Recorded locally in this browser. Rows written by earlier versions are re-labelled from their score when
        loaded.
      </p>
    </div>
  );
};
