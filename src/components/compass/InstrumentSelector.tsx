// ============================================
// INSTRUMENT SELECTOR
// ============================================
// The three assets: GOLD, S&P 500, DOW JONES. Gold is the default.
//
// An instrument whose provider is not configured is still selectable — it is
// better to show an explicit "no data source configured" state than to hide the
// instrument the user actually trades — but it is marked as such.

import React from 'react';
import type { Instrument } from '../../core/instruments';
import { INSTRUMENTS } from '../../core/instruments';
import { cn } from '@/lib/utils';

interface InstrumentSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  /**
   * Which instruments have a configured provider, keyed by instrument id.
   * `undefined` means "not known yet" — rendered as neutral, not as unavailable.
   */
  availability: Record<string, boolean | undefined>;
}

export const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({ selectedId, onSelect, availability }) => {
  return (
    <div className="flex items-center gap-2">
      {INSTRUMENTS.map(instrument => {
        const isSelected = selectedId === instrument.id;
        const isUnavailable = availability[instrument.id] === false;

        return (
          <button
            key={instrument.id}
            type="button"
            onClick={() => onSelect(instrument.id)}
            title={isUnavailable ? `${instrument.name} — no data source configured` : instrument.name}
            aria-pressed={isSelected}
            className={cn(
              'rounded-lg px-4 py-1.5 text-label font-bold tracking-wide transition-all',
              isSelected
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]'
                : 'border border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:text-white'
            )}
          >
            {instrument.shortLabel}
          </button>
        );
      })}
    </div>
  );
};
