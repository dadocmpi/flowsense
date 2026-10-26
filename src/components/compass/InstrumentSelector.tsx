// ============================================
// INSTRUMENT SELECTOR
// ============================================
// Gold, S&P 500 and Dow futures.
//
// An instrument whose provider is not configured is still selectable — it is
// better to show an explicit "no data source configured" state for GC than to
// hide the instrument the user actually trades — but it is marked as such.

import React from 'react';
import { FUTURES_INSTRUMENTS } from '../../core/instruments';
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
      <span className="hidden text-micro font-semibold uppercase tracking-wider text-white/30 sm:inline">
        Futures
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {FUTURES_INSTRUMENTS.map(instrument => {
          const isSelected = selectedId === instrument.id;
          const known = availability[instrument.id];
          // Only a confirmed `false` earns the unavailable marker. An
          // unknown state shows nothing rather than a warning we cannot back.
          const isUnavailable = known === false;
          const title = isUnavailable ? `${instrument.name} — no data source configured` : instrument.name;

          return (
            <button
              key={instrument.id}
              type="button"
              onClick={() => onSelect(instrument.id)}
              title={title}
              aria-pressed={isSelected}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1 text-label font-bold transition-all',
                isSelected
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]'
                  : 'border border-white/[0.04] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white'
              )}
            >
              <span className="font-mono">{instrument.shortLabel}</span>
              {isUnavailable && (
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', isSelected ? 'bg-black/50' : 'bg-amber-500/70')}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
