import { describe, expect, it } from 'vitest';
import { buildOrderFlowReading, classifyFlowState } from '../reading';
import { candleDeltas, utcResetBoundary, type MinuteBucket } from '../aggregate';
import { DEFAULT_COMPASS_CONFIG } from '../../../config/compass';

const MIN = 60_000;
const base = Date.UTC(2026, 10, 8, 3, 0, 0);

function minutes(buy: number, sell: number, count: number): MinuteBucket[] {
  const out: MinuteBucket[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ bucketStart: base + i * MIN, buy, sell, trades: 1 });
  }
  return out;
}

describe('flow state hysteresis', () => {
  it('enters a side only after N consecutive candles past the zone', () => {
    // zone 15, hysteresis 2
    expect(classifyFlowState([30], { imbalanceLevels: 10, smoothing: 1, neutralZone: 15, hysteresis: 2 })).toBe('NEUTRAL');
    expect(classifyFlowState([30, 30], { imbalanceLevels: 10, smoothing: 1, neutralZone: 15, hysteresis: 2 })).toBe('BUYING');
  });

  it('holds the committed state through a single opposite blip', () => {
    const cfg = { imbalanceLevels: 10, smoothing: 1, neutralZone: 15, hysteresis: 2 };
    expect(classifyFlowState([30, 30, -30, 30], cfg)).toBe('BUYING');
  });

  it('stays neutral when the reading never leaves the zone', () => {
    const cfg = { imbalanceLevels: 10, smoothing: 1, neutralZone: 15, hysteresis: 2 };
    expect(classifyFlowState([10, -10, 5, -5], cfg)).toBe('NEUTRAL');
  });
});

describe('buildOrderFlowReading', () => {
  it('reads net aggressive delta and a buy side from closed candles', () => {
    const deltas = candleDeltas(minutes(8, 2, 5), 1, utcResetBoundary(base), 100);
    const reading = buildOrderFlowReading(deltas, 0.4, DEFAULT_COMPASS_CONFIG);
    // Each closed candle: buy 8, sell 2 -> delta +6; 4 closed candles -> +24
    expect(reading.metrics.delta).toBe(24);
    expect(reading.metrics.buyShare).toBeCloseTo(0.8, 6);
    expect(reading.metrics.imbalance).toBeCloseTo(0.4, 6);
    expect(reading.state).toBe('BUYING');
    expect(reading.gauge.label).toBe('STRONG_BUY');
    expect(reading.gauge.score).toBeGreaterThan(60);
  });

  it('reads a sell side from a sell-heavy tape', () => {
    const deltas = candleDeltas(minutes(1, 9, 6), 1, utcResetBoundary(base), 100);
    const reading = buildOrderFlowReading(deltas, -0.5, DEFAULT_COMPASS_CONFIG);
    expect(reading.metrics.delta).toBeLessThan(0);
    expect(reading.state).toBe('SELLING');
    expect(reading.gauge.score).toBeLessThan(-60);
  });

  it('reports a null book imbalance when there is no book', () => {
    const deltas = candleDeltas(minutes(5, 5, 4), 1, utcResetBoundary(base), 100);
    const reading = buildOrderFlowReading(deltas, null, DEFAULT_COMPASS_CONFIG);
    expect(reading.metrics.imbalance).toBeNull();
    // Balanced flow with no book reads neutral.
    expect(reading.state).toBe('NEUTRAL');
    expect(reading.gauge.score).toBe(0);
  });

  it('reports no numbers at all for an empty window rather than zeros', () => {
    const reading = buildOrderFlowReading([], null, DEFAULT_COMPASS_CONFIG);
    expect(reading.candleCount).toBe(0);
    expect(reading.metrics.cvd).toBeNull();
    expect(reading.metrics.buyShare).toBeNull();
    expect(reading.metrics.volume).toBe(0);
  });

  it('excludes the forming candle from the gauge', () => {
    // 3 buckets: two heavy-buy closed, one heavy-sell forming -> forming ignored
    const buckets: MinuteBucket[] = [
      { bucketStart: base, buy: 10, sell: 0, trades: 1 },
      { bucketStart: base + MIN, buy: 10, sell: 0, trades: 1 },
      { bucketStart: base + 2 * MIN, buy: 0, sell: 10, trades: 1 },
    ];
    const deltas = candleDeltas(buckets, 1, utcResetBoundary(base), 100);
    const reading = buildOrderFlowReading(deltas, null, DEFAULT_COMPASS_CONFIG);
    expect(reading.candleCount).toBe(2);
    expect(reading.metrics.delta).toBe(20);
    expect(reading.state).toBe('BUYING');
  });
});
