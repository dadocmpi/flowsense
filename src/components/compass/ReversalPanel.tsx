import React from 'react';
import { cn } from '@/lib/utils';
import { ReversalSignal, SRLevel } from '../../types/srReversal';
import { reversalStateLabel, srTypeLabel } from '../../lib/labels';

interface ReversalPanelProps {
  reversalSignal: ReversalSignal | null;
  srLevels: SRLevel[];
  price: number;
  precision: number;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-2 text-sm last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={cn('font-mono text-white/90', tone)}>{value}</span>
    </div>
  );
}

function formatPrice(value: number, precision: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

/**
 * Support, resistance and reversal context. This used to be a full-width
 * block of its own; it now sits inside the Advanced details area so it
 * supports the compass instead of competing with it.
 */
export const ReversalPanel: React.FC<ReversalPanelProps> = ({ reversalSignal, srLevels, price, precision }) => {
  const supports = srLevels.filter(level => level.direction === 'SUPPORT');
  const resistances = srLevels.filter(level => level.direction === 'RESISTANCE');

  const nearestSupport = supports.reduce(
    (prev, current) => (Math.abs(current.priceLow - price) < Math.abs(prev.priceLow - price) ? current : prev),
    supports[0] ?? null
  );
  const nearestResistance = resistances.reduce(
    (prev, current) => (Math.abs(current.priceLow - price) < Math.abs(prev.priceLow - price) ? current : prev),
    resistances[0] ?? null
  );

  const anyZoneTouched = srLevels.some(level =>
    ['TOUCHING', 'RETESTING', 'REJECTING', 'BREAKING'].includes(level.zoneState)
  );

  const levelValue = (level: SRLevel | null, emptyText: string) =>
    level && level.priceLow > 0
      ? `${formatPrice(level.priceLow, precision)} · ${srTypeLabel(level.type)} · ${level.strength}% strength`
      : emptyText;

  return (
    <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">Support and resistance</h4>
        <Row label="Nearest support" value={levelValue(nearestSupport, 'Unavailable')} tone="text-green-400" />
        <Row label="Nearest resistance" value={levelValue(nearestResistance, 'Unavailable')} tone="text-red-400" />
        <Row
          label="Zone touched"
          value={anyZoneTouched ? 'Yes' : 'No'}
          tone={anyZoneTouched ? 'text-green-400' : 'text-white/60'}
        />
        <Row label="Levels tracked" value={String(srLevels.length)} />
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">Reversal watch</h4>
        <Row label="State" value={reversalStateLabel(reversalSignal?.state ?? 'NO_TRADE')} />
        {reversalSignal ? (
          <>
            <Row label="Confidence" value={`${reversalSignal.confidence}%`} />
            <Row
              label="Volume vs average"
              value={reversalSignal.volumeConfirmation.volumeRatio > 0 ? `${reversalSignal.volumeConfirmation.volumeRatio.toFixed(2)}x` : 'Unavailable'}
            />
            <Row
              label="Timeframes aligned"
              value={reversalSignal.timeframeAgreement.aligned.join(', ') || 'None'}
            />
            <Row
              label="Invalidation level"
              value={reversalSignal.invalidation.level > 0 ? formatPrice(reversalSignal.invalidation.level, precision) : 'Unavailable'}
            />
            {reversalSignal.reason && (
              <p className="mt-3 text-xs leading-relaxed text-white/50">{reversalSignal.reason}</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-xs text-white/40">
            No reversal is being watched. The engine reports one only when price is touching a monitored level.
          </p>
        )}
      </div>
    </div>
  );
};
