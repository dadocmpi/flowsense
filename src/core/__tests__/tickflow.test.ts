// ============================================
// TICK FLOW TESTS
// ============================================
// The tick rule and the window statistics are what the live panel renders, so
// they are pinned here: the side inference, the tie-break, the window trim and
// the pressure thresholds.

import { describe, expect, it } from 'vitest';
import {
  classifyTicks,
  computeFlowReading,
  EMPTY_FLOW_READING,
  PRESSURE_LOW_MAX,
  PRESSURE_MEDIUM_MAX,
  pressureFromRatio,
  type FlowTick,
} from '../tickflow';

function ticks(...prices: number[]): FlowTick[] {
  return prices.map((price, i) => ({ price, timestamp: 1_700_000_000_000 + i }));
}

describe('classifyTicks', () => {
  it('marks a print above the previous one as a buy and below as a sell', () => {
    const { classified } = classifyTicks(ticks(100, 101, 100.5, 102));
    expect(classified.map(t => t.side)).toEqual(['BUY', 'BUY', 'SELL', 'BUY']);
  });

  it('inherits the previous side when the price is unchanged', () => {
    const { classified } = classifyTicks(ticks(100, 101, 101, 101, 100));
    // 100 -> 101 buy; the two flat prints inherit buy; 101 -> 100 sell.
    expect(classified.map(t => t.side)).toEqual(['BUY', 'BUY', 'BUY', 'BUY', 'SELL']);
  });

  it('seeds the first print with the supplied side', () => {
    const { classified, lastSide } = classifyTicks(ticks(100), 'SELL');
    expect(classified[0].side).toBe('SELL');
    expect(lastSide).toBe('SELL');
  });

  it('carries the last side across a chunk boundary', () => {
    const first = classifyTicks(ticks(100, 101));
    const second = classifyTicks(ticks(101), first.lastSide);
    // The flat print at 101 inherits the buy side from the previous chunk.
    expect(second.classified[0].side).toBe('BUY');
  });

  it('skips non-positive and non-finite prices', () => {
    const { classified } = classifyTicks([
      { price: 100, timestamp: 1 },
      { price: Number.NaN, timestamp: 2 },
      { price: 0, timestamp: 3 },
      { price: 101, timestamp: 4 },
    ]);
    expect(classified).toHaveLength(2);
    expect(classified.map(t => t.side)).toEqual(['BUY', 'BUY']);
  });

  it('assumes a size of 1 when the feed reports none, and flags it', () => {
    const { classified } = classifyTicks(ticks(100, 101));
    expect(classified.every(t => t.size === 1 && t.sizeAssumed)).toBe(true);
  });

  it('keeps a real reported size and does not flag it as assumed', () => {
    const { classified } = classifyTicks([
      { price: 100, timestamp: 1, size: 25 },
      { price: 101, timestamp: 2, size: 10 },
    ]);
    expect(classified.map(t => t.size)).toEqual([25, 10]);
    expect(classified.some(t => t.sizeAssumed)).toBe(false);
  });
});

describe('computeFlowReading', () => {
  it('splits buyers and sellers by the classified side and sizes', () => {
    const { classified } = classifyTicks([
      { price: 100, timestamp: 1, size: 30 },
      { price: 101, timestamp: 2, size: 10 },
      { price: 100, timestamp: 3, size: 10 },
    ]);
    const reading = computeFlowReading(classified);
    expect(reading.buyVolume).toBe(40);
    expect(reading.sellVolume).toBe(10);
    expect(reading.totalVolume).toBe(50);
    expect(reading.buyersPct).toBeCloseTo(80);
    expect(reading.sellersPct).toBeCloseTo(20);
    expect(reading.volumeDelta).toBe(30);
    expect(reading.basis).toBe('size');
  });

  it('reports a tick-count basis when any print lacked a size', () => {
    const { classified } = classifyTicks(ticks(100, 101));
    expect(computeFlowReading(classified).basis).toBe('tick-count');
  });

  it('measures only the most recent `window` prints', () => {
    const { classified } = classifyTicks(ticks(100, 101, 100, 101, 100, 101));
    const reading = computeFlowReading(classified, 2);
    expect(reading.sampleCount).toBe(2);
  });

  it('is balanced at 50/50 before any print', () => {
    expect(EMPTY_FLOW_READING.buyersPct).toBe(50);
    expect(EMPTY_FLOW_READING.sampleCount).toBe(0);
  });

  it('reads a one-sided window as HIGH pressure and a balanced one as LOW', () => {
    const oneSided = computeFlowReading(classifyTicks(ticks(100, 101, 102, 103)).classified);
    expect(oneSided.pressure).toBe('HIGH');

    // Two buys and two sells of equal size: 100(seed buy) 101(buy) 100(sell) 99(sell).
    const balanced = computeFlowReading(
      classifyTicks([
        { price: 100, timestamp: 1, size: 10 },
        { price: 101, timestamp: 2, size: 10 },
        { price: 100, timestamp: 3, size: 10 },
        { price: 99, timestamp: 4, size: 10 },
      ]).classified
    );
    expect(balanced.pressure).toBe('LOW');
  });
});

describe('pressureFromRatio', () => {
  it('bands the absolute delta ratio', () => {
    expect(pressureFromRatio(0)).toBe('LOW');
    expect(pressureFromRatio(PRESSURE_LOW_MAX - 0.01)).toBe('LOW');
    expect(pressureFromRatio(PRESSURE_LOW_MAX)).toBe('MEDIUM');
    expect(pressureFromRatio(PRESSURE_MEDIUM_MAX - 0.01)).toBe('MEDIUM');
    expect(pressureFromRatio(PRESSURE_MEDIUM_MAX)).toBe('HIGH');
    expect(pressureFromRatio(1)).toBe('HIGH');
  });

  it('treats a non-finite ratio as LOW rather than throwing', () => {
    expect(pressureFromRatio(Number.NaN)).toBe('LOW');
  });
});
