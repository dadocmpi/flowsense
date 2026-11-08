// ============================================
// COMPASS INPUTS DRAWER
// ============================================
// A collapsed-by-default disclosure under the Compass listing EVERY input that
// feeds it — including the rows hidden from the Technical indicators table — with
// each input's state (Buy / Sell / Neutral) and weight. This keeps the signal
// auditable for a reviewer even when a row is hidden.
//
// A native <details>/<summary> is used so the disclosure is keyboard accessible
// and collapsed on load with no JavaScript.

import React from 'react';
import type { CompassConfig } from '../../config/compass';
import type { GaugeReading } from '../../core/types';
import { voteColor, voteWord } from './format';
import { PALETTE } from '../common/palette';

interface CompassInputsDrawerProps {
  /** The technical compass reading whose details are the inputs. */
  technical: GaugeReading | null;
  config: CompassConfig;
  /** The order-flow contribution to the Summary, when a real source exists. */
  orderFlow?: { label: string; score: number; weight: number } | null;
}

export const CompassInputsDrawer: React.FC<CompassInputsDrawerProps> = ({ technical, config, orderFlow }) => {
  const details = technical?.details ?? [];

  const weightOf = (name: string): number =>
    config.maWeights[name] ?? config.indicatorWeights[name] ?? 1;

  const totalWeight = details.reduce((sum, d) => sum + weightOf(d.name), 0);

  return (
    <details className="group text-micro">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ink-subtle hover:text-ink-muted">
        <span className="inline-block transition-transform group-open:rotate-90">▸</span>
        <span className="uppercase tracking-[0.08em]">Compass inputs</span>
        <span className="text-ink-subtle/70">({details.length})</span>
      </summary>

      <div className="mt-2 max-h-[240px] overflow-y-auto rounded-sm border border-line bg-base-2">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-base-2">
            <tr className="border-b border-line text-left text-micro uppercase tracking-[0.06em] text-ink-subtle">
              <th className="px-2 py-1 font-medium">Input</th>
              <th className="px-2 py-1 text-right font-medium">Value</th>
              <th className="px-2 py-1 text-right font-medium">State</th>
              <th className="px-2 py-1 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {details.map(detail => (
              <tr key={detail.name} className="border-b border-line/40 last:border-0">
                <td className="px-2 py-[2px] text-ink-muted">{detail.name}</td>
                <td className="px-2 py-[2px] text-right font-mono tabular text-ink">{detail.display}</td>
                <td className="px-2 py-[2px] text-right font-medium" style={{ color: voteColor(detail.vote) }}>
                  {voteWord(detail.vote)}
                </td>
                <td className="px-2 py-[2px] text-right font-mono tabular text-ink-subtle">
                  {weightOf(detail.name).toFixed(1)}
                </td>
              </tr>
            ))}
            {orderFlow && (
              <tr className="border-t border-line bg-base-1">
                <td className="px-2 py-[2px] text-ink-muted" colSpan={2}>
                  {orderFlow.label}
                  <span className="ml-1 text-ink-subtle/70">(Summary blend)</span>
                </td>
                <td className="px-2 py-[2px] text-right font-mono tabular" style={{ color: orderFlow.score >= 0 ? PALETTE.pos : PALETTE.neg }}>
                  {orderFlow.score >= 0 ? '+' : ''}
                  {Math.round(orderFlow.score)}
                </td>
                <td className="px-2 py-[2px] text-right font-mono tabular text-ink-subtle">
                  {orderFlow.weight.toFixed(1)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line text-ink-subtle">
              <td className="px-2 py-1" colSpan={3}>
                Total input weight
              </td>
              <td className="px-2 py-1 text-right font-mono tabular">{totalWeight.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
};
