// ============================================
// INDICATOR VISIBILITY CONFIG
// ============================================
// One entry per indicator: `{ id, label, group, showInTable }`.
//
// IMPORTANT: `showInTable` is VISUAL ONLY. Every indicator keeps being computed
// and keeps feeding the Confluence Compass and the Summary exactly as before.
// Hiding one removes its row from the Technical indicators table and nothing
// else — the Compass result is identical whether a row is shown or not. (This is
// locked in by the regression test in src/core/__tests__/indicatorVisibility.)
//
// Edit this file to change what the table shows. `id` must match the indicator's
// `name` in src/core/votes.ts, because that is the key the votes and the weights
// are indexed by.
//
// The default hides the oscillators that overlap with a Smart-Money-Concepts +
// technical-confluence read: Williams %R, Ultimate Oscillator, Bull/Bear Power,
// ROC and Highs/Lows. Everything else is visible.

import type { VoteGroup } from '../core/types';

interface IndicatorVisibility {
  /** The indicator's name in votes.ts, e.g. "RSI (14)". */
  id: string;
  /** Display label (kept explicit so the table can label a row independently). */
  label: string;
  group: VoteGroup;
  /** False hides the row from the table ONLY; the indicator still votes. */
  showInTable: boolean;
}

export const INDICATOR_VISIBILITY: IndicatorVisibility[] = [
  // ── Moving averages (all visible) ───────────────────────────────────────
  { id: 'SMA 5', label: 'SMA 5', group: 'MA', showInTable: true },
  { id: 'EMA 5', label: 'EMA 5', group: 'MA', showInTable: true },
  { id: 'SMA 10', label: 'SMA 10', group: 'MA', showInTable: true },
  { id: 'EMA 10', label: 'EMA 10', group: 'MA', showInTable: true },
  { id: 'SMA 20', label: 'SMA 20', group: 'MA', showInTable: true },
  { id: 'EMA 20', label: 'EMA 20', group: 'MA', showInTable: true },
  { id: 'SMA 50', label: 'SMA 50', group: 'MA', showInTable: true },
  { id: 'EMA 50', label: 'EMA 50', group: 'MA', showInTable: true },
  { id: 'SMA 100', label: 'SMA 100', group: 'MA', showInTable: true },
  { id: 'EMA 100', label: 'EMA 100', group: 'MA', showInTable: true },
  { id: 'SMA 200', label: 'SMA 200', group: 'MA', showInTable: true },
  { id: 'EMA 200', label: 'EMA 200', group: 'MA', showInTable: true },

  // ── Oscillators ─────────────────────────────────────────────────────────
  { id: 'RSI (14)', label: 'RSI (14)', group: 'OSCILLATOR', showInTable: true },
  { id: 'Stochastic (9,6)', label: 'Stochastic (9,6)', group: 'OSCILLATOR', showInTable: true },
  { id: 'Stochastic RSI (14)', label: 'Stochastic RSI (14)', group: 'OSCILLATOR', showInTable: true },
  { id: 'MACD (12,26,9)', label: 'MACD (12,26,9)', group: 'OSCILLATOR', showInTable: true },
  { id: 'ADX (14)', label: 'ADX (14)', group: 'OSCILLATOR', showInTable: true },
  { id: 'CCI (14)', label: 'CCI (14)', group: 'OSCILLATOR', showInTable: true },
  { id: 'ATR (14)', label: 'ATR (14)', group: 'OSCILLATOR', showInTable: true },
  { id: 'Bollinger Bands (20,2)', label: 'Bollinger Bands (20,2)', group: 'OSCILLATOR', showInTable: true },
  { id: 'ATR vs average', label: 'ATR vs average', group: 'OSCILLATOR', showInTable: true },
  { id: 'VWAP', label: 'VWAP', group: 'OSCILLATOR', showInTable: true },

  // Redundant with an SMC + technical-confluence read: hidden from the table,
  // still computed and still voting.
  { id: 'Williams %R (14)', label: 'Williams %R (14)', group: 'OSCILLATOR', showInTable: false },
  { id: 'Ultimate Oscillator', label: 'Ultimate Oscillator', group: 'OSCILLATOR', showInTable: false },
  { id: 'Bull/Bear Power (13)', label: 'Bull/Bear Power (13)', group: 'OSCILLATOR', showInTable: false },
  { id: 'ROC (12)', label: 'ROC (12)', group: 'OSCILLATOR', showInTable: false },
  { id: 'Highs/Lows (14)', label: 'Highs/Lows (14)', group: 'OSCILLATOR', showInTable: false },
];

const BY_ID = new Map(INDICATOR_VISIBILITY.map(entry => [entry.id, entry]));

/** Whether an indicator's row is shown in the table. Unknown ids default to shown. */
export function isShownInTable(id: string): boolean {
  return BY_ID.get(id)?.showInTable ?? true;
}
