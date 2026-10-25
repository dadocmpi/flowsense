// ============================================
// INSTRUMENT SELECTOR
// ============================================
// Gold, S&P 500 and Dow futures are the primary group; Binance crypto pairs
// are the secondary group.
//
// An instrument whose provider is not configured is still selectable — it is
// better to show an explicit "no data source configured" state for GC than to
// hide the instrument the user actually trades — but it is marked as such.

import React from 'react';
import type { Instrument, InstrumentGroup } from '../../core/instruments';
import { CRYPTO_INSTRUMENTS, FUTURES_INSTRUMENTS } from '../../core/instruments';
import { cn } from '@/lib/utils';

interface InstrumentSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  /** Which instruments have a configured provider, keyed by instrument id. */
  availability: Record<string, boolean>;
}

const GROUPS: Array<{ group: InstrumentGroup; label: string; instruments: Instrument[] }> = [
  { group: 'FUTURES', label: 'Futures', instruments: FUTURES_INSTRUMENTS },
  { group: 'CRYPTO', label: 'Crypto', instruments: CRYPTO_INSTRUMENTS },
];

export const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({ selectedId, onSelect, availability }) => {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      {GROUPS.map(({ group, label, instruments }) => (
        <div key={group} className="flex items-center gap-2">
          <span className="hidden text-micro font-semibold uppercase tracking-wider text-white/30 sm:inline">
            {label}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {instruments.map(instrument => {
              const isSelected = selectedId === instrument.id;
              const isAvailable = availability[instrument.id] !== false;
              const title = isAvailable
                ? instrument.name
                : `${instrument.name} — no data source configured`;

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
                  {!isAvailable && (
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        isSelected ? 'bg-black/50' : 'bg-amber-500/70'
                      )}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
