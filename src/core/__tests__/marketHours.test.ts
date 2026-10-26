// ============================================
// MARKET OPEN / CLOSED TESTS
// ============================================
// A closed market must be reported as closed, so a stale reading is never shown
// as if it were live.

import { describe, expect, it } from 'vitest';
import { CLOSED_AFTER_BARS, marketState } from '../marketHours';
import type { Candle } from '../types';

function candleAt(datetime: string): Candle {
  return { datetime, open: 1, high: 1, low: 1, close: 1, volume: 1 };
}

/** A fixed reference instant, so the tests do not depend on the wall clock. */
const NOW = Date.parse('2024-06-10T12:00:00Z');

describe('marketState', () => {
  it('reports UNKNOWN when there are no candles to judge from', () => {
    const result = marketState([], '1m', NOW);
    expect(result.state).toBe('UNKNOWN');
    expect(result.stalenessMs).toBeNull();
  });

  it('reports OPEN when the newest bar is current', () => {
    const result = marketState([candleAt('2024-06-10 11:59:00')], '1m', NOW);
    expect(result.state).toBe('OPEN');
    expect(result.stalenessMs).toBe(60_000);
  });

  it('reports OPEN right up to the tolerance boundary', () => {
    // 1m bars, three bars of tolerance = 3 minutes. Two minutes stale is open.
    const result = marketState([candleAt('2024-06-10 11:58:00')], '1m', NOW);
    expect(result.state).toBe('OPEN');
  });

  it('reports CLOSED once several bar lengths have passed with no new bar', () => {
    const result = marketState([candleAt('2024-06-10 11:50:00')], '1m', NOW);
    expect(result.state).toBe('CLOSED');
    expect(result.reason).toMatch(/market looks closed/i);
  });

  it('scales the tolerance with the timeframe, so a daily bar is not called closed too early', () => {
    // A 1D bar from the previous session is well inside three daily bars.
    const result = marketState([candleAt('2024-06-09 00:00:00')], '1D', NOW);
    expect(result.state).toBe('OPEN');
    expect(result.toleranceMs).toBe(3 * 1440 * 60_000);
  });

  it('exposes the tolerance it applied, so the UI can explain itself', () => {
    const result = marketState([candleAt('2024-06-10 11:59:00')], '15m', NOW);
    expect(result.toleranceMs).toBe(15 * CLOSED_AFTER_BARS * 60_000);
  });

  it('reports UNKNOWN when the newest bar has an unreadable timestamp', () => {
    const result = marketState([candleAt('not-a-date')], '1m', NOW);
    expect(result.state).toBe('UNKNOWN');
  });
});
