// ============================================
// INSTRUMENT SELECTOR
// ============================================
// Gold (Twelve Data) and the S&P 500 / Dow / Nasdaq index assets (Alpaca), as a
// clean segmented control. Selection is a subtle accent fill, never a loud
// highlight.
//
// An instrument whose provider is not configured is still selectable — it is
// better to show an explicit "no data source configured" state than to hide the
// instrument the user actually trades — but it is marked with a small dot and a
// tooltip.

import React from 'react';
import { ALL_INSTRUMENTS } from '../../core/instruments';
import { SegmentedControl } from '../common/SegmentedControl';

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
  const options = ALL_INSTRUMENTS.map(instrument => {
    const known = availability[instrument.id];
    const unavailable = known === false;
    return {
      value: instrument.id,
      label: unavailable ? `${instrument.shortLabel} •` : instrument.shortLabel,
      title: unavailable ? `${instrument.name} — no data source configured` : instrument.name,
    };
  });

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-micro font-semibold uppercase tracking-[0.12em] text-ink-muted sm:inline">
        Assets
      </span>
      <SegmentedControl
        ariaLabel="Asset"
        value={selectedId}
        onChange={onSelect}
        options={options}
      />
    </div>
  );
};
