// ============================================
// COMPASS ROSTER — which lines the compass shows, and why one is N/A
// ============================================
// The compass lists EVERY factor it is built from, whether or not that factor
// could be computed. An indicator whose warmup is longer than the candle series
// is shown as "N/A" with the number of candles it needs, rather than silently
// disappearing from the list — a missing row looks like a factor that does not
// exist, while an N/A row says exactly why it is absent.
//
// The roster does not recompute anything: it matches the names the vote logic
// produces against a fixed list. If the vote logic could not produce a factor
// (too few candles), the slot is filled with null and rendered as N/A. This
// keeps one source of truth for the math (core/votes) and one for the list.
//
// Pure: no I/O, no clock, no React.

import type { VoteDetail } from './types';

/** One expected factor and the warmup it needs to produce a value. */
export interface RosterSlot {
  name: string;
  /** Candles required before this factor yields a value; the N/A reason. */
  minCandles: number;
}

/**
 * The moving averages the compass expects: SMA and EMA over each period. The
 * warmup is simply the period — an EMA(200) needs 200 closes before it exists.
 */
export const MA_ROSTER: RosterSlot[] = [5, 10, 20, 50, 100, 200].flatMap(period => [
  { name: `SMA ${period}`, minCandles: period },
  { name: `EMA ${period}`, minCandles: period },
]);

/**
 * The oscillators the compass expects, with the standard warmup for each.
 * MACD(12,26,9) needs 12 + 26 + 9 - 13 ≈ 34 points; the Ultimate Oscillator's
 * longest window is 28; Bollinger(20,2) needs 20. These are documented here so
 * the N/A tooltip can state a real number.
 */
export const OSCILLATOR_ROSTER: RosterSlot[] = [
  { name: 'RSI (14)', minCandles: 15 },
  { name: 'Stochastic (9,6)', minCandles: 14 },
  { name: 'Stochastic RSI (14)', minCandles: 18 },
  { name: 'MACD (12,26,9)', minCandles: 34 },
  { name: 'ADX (14)', minCandles: 28 },
  { name: 'Williams %R (14)', minCandles: 14 },
  { name: 'CCI (14)', minCandles: 14 },
  { name: 'ATR (14)', minCandles: 15 },
  { name: 'Highs/Lows (14)', minCandles: 14 },
  { name: 'Ultimate Oscillator', minCandles: 28 },
  { name: 'ROC (12)', minCandles: 13 },
  { name: 'Bull/Bear Power (13)', minCandles: 13 },
  { name: 'Bollinger Bands (20,2)', minCandles: 20 },
  { name: 'ATR vs average', minCandles: 30 },
  { name: 'VWAP', minCandles: 1 },
];

/** A roster slot with the detail the engine produced, or null when it is N/A. */
export interface RosterRow extends RosterSlot {
  /** The computed detail, or null when there were too few candles. */
  detail: VoteDetail | null;
  /** True when the factor has a value. */
  available: boolean;
  /** Candles actually available, for the N/A explanation. */
  candleCount: number;
}

function fillRoster(roster: RosterSlot[], details: VoteDetail[], candleCount: number): RosterRow[] {
  const byName = new Map(details.map(detail => [detail.name, detail]));
  return roster.map(slot => {
    const detail = byName.get(slot.name) ?? null;
    return {
      ...slot,
      detail,
      available: detail !== null,
      candleCount,
    };
  });
}

/**
 * Build the moving-average roster from the details the engine already produced.
 * A name with no detail is an N/A slot; nothing is recomputed here.
 */
export function movingAverageRoster(details: VoteDetail[], candleCount: number): RosterRow[] {
  return fillRoster(MA_ROSTER, details, candleCount);
}

/** Build the oscillator roster from the engine's indicator details. */
export function oscillatorRoster(details: VoteDetail[], candleCount: number): RosterRow[] {
  return fillRoster(OSCILLATOR_ROSTER, details, candleCount);
}

/** Split one gauge's details into its MA roster and its oscillator roster. */
export function gaugeRosters(details: VoteDetail[], candleCount: number): { movingAverages: RosterRow[]; oscillators: RosterRow[] } {
  return {
    movingAverages: movingAverageRoster(
      details.filter(detail => detail.group === 'MA'),
      candleCount
    ),
    oscillators: oscillatorRoster(
      details.filter(detail => detail.group !== 'MA'),
      candleCount
    ),
  };
}
