// ============================================
// TIMEFRAME SELECTOR
// ============================================
// A segmented control with the label and nothing else: no score, no signal word,
// no colour that could be read as a signal. Only the selected one is highlighted.
//
// Selecting one shows that timeframe's own already-loaded reading; it never
// triggers a per-indicator fetch. Every segment is disabled while a load is in
// flight, so two loads can never race.

import React from 'react';
import type { Timeframe } from '../../core/types';
import { TIMEFRAMES, TIMEFRAME_LABELS } from '../../core/types';
import { SegmentedControl } from '../common/SegmentedControl';

interface TimeframeButtonsProps {
  selected: Timeframe;
  onSelect: (timeframe: Timeframe) => void;
  /** True while any timeframe request is in flight. */
  busy: boolean;
}

export const TimeframeButtons: React.FC<TimeframeButtonsProps> = ({ selected, onSelect, busy }) => {
  const options = TIMEFRAMES.map(timeframe => ({
    value: timeframe,
    label: TIMEFRAME_LABELS[timeframe],
    disabled: busy,
  }));

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-micro font-semibold uppercase tracking-[0.12em] text-ink-muted sm:inline">
        Timeframe
      </span>
      <SegmentedControl ariaLabel="Timeframe" value={selected} onChange={onSelect} options={options} />
    </div>
  );
};
