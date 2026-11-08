// ============================================
// INSTRUMENT SELECTOR
// ============================================
// Gold (Twelve Data) and the index assets (Alpaca). An instrument whose provider
// is not configured stays selectable — an explicit "no source" state beats
// hiding the asset — but it is marked as such.

import React from 'react';
import { ALL_INSTRUMENTS } from '../../core/instruments';
import { cn } from '@/lib/utils';
import { PALETTE } from '../common/palette';

interface InstrumentSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  availability: Record<string, boolean | undefined>;
}

export const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({ selectedId, onSelect, availability }) => (
  <div className="flex items-center gap-2">
    <span className="hidden text-micro uppercase tracking-[0.08em] text-ink-subtle sm:inline">Asset</span>
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Asset">
      {ALL_INSTRUMENTS.map(instrument => {
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
              'flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-label font-medium transition-colors',
              isSelected
                ? 'border-accent/60 bg-accent/15 text-ink'
                : 'border-line bg-base-1 text-ink-subtle hover:bg-base-3 hover:text-ink'
            )}
          >
            <span className="font-mono">{instrument.shortLabel}</span>
            {isUnavailable && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: PALETTE.warn }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  </div>
);
