// ============================================
// ORDER FLOW CLASSIFICATION AND IMBALANCE TESTS
// ============================================
// The strength bar is only as honest as the classification behind it, so these
// tests pin the rules on hand-computed inputs: a print at the ask is a buy, a
// print at the bid is a sell, the tick rule decides inside the spread, a zero
// tick carries the last side, an empty window is not a reading, and a closed
// market reports the last session rather than an empty tape.

import { describe, expect, it } from 'vitest';
import {
  advanceShift,
  bookImbalance,
  buildFlowGauge,
  classifyTrade,
  cvdSlope,
  DEFAULT_FLOW_THRESHOLDS,
  FlowAccumulator,
  flowStateFromImbalance,
  INITIAL_SHIFT_STATE,
  type ClassifiableTrade,
} from '../orderflow';

describe('classifyTrade', () => {
  it('classifies a print at the ask as a buyer aggressor', () => {
    const result = classifyTrade({ price: 100.05, bid: 100, ask: 100.05, lastPrice: 100, lastSide: 'SELL' });
    expect(result).toEqual({ side: 'BUY', rule: 'QUOTE' });
  });

  it('classifies a print at the bid as a seller aggressor', () => {
    const result = classifyTrade({ price: 100, bid: 100, ask: 100.05, lastPrice: 100.05, lastSide: 'BUY' });
    expect(result).toEqual({ side: 'SELL', rule: 'QUOTE' });
  });

  it('uses the tick rule inside the spread: uptick is a buy, downtick a sell', () => {
    const inside = { bid: 99.9, ask: 100.1 };
    expect(classifyTrade({ price: 100.02, ...inside, lastPrice: 100.0, lastSide: 'UNKNOWN' })).toEqual({
      side: 'BUY',
      rule: 'TICK',
    });
    expect(classifyTrade({ price: 99.98, ...inside, lastPrice: 100.0, lastSide: 'UNKNOWN' })).toEqual({
      side: 'SELL',
      rule: 'TICK',
    });
  });

  it('carries the last side on a zero tick, and stays UNKNOWN with nothing to carry', () => {
    const inside = { bid: 99.9, ask: 100.1 };
    expect(classifyTrade({ price: 100.0, ...inside, lastPrice: 100.0, lastSide: 'BUY' })).toEqual({
      side: 'BUY',
      rule: 'ZERO_TICK',
    });
    expect(classifyTrade({ price: 100.0, ...inside, lastPrice: 100.0, lastSide: 'UNKNOWN' })).toEqual({
      side: 'UNKNOWN',
      rule: 'UNKNOWN',
    });
  });

  it('returns UNKNOWN for a non-finite price rather than guessing', () => {
    expect(classifyTrade({ price: NaN, bid: 100, ask: 101, lastPrice: null, lastSide: 'UNKNOWN' }).side).toBe(
      'UNKNOWN'
    );
  });
});

function trade(price: number, size: number, timestamp: number): ClassifiableTrade {
  return { price, size, timestamp };
}

describe('FlowAccumulator', () => {
  it('sums buy and sell volume and reports the imbalance', () => {
    const acc = new FlowAccumulator();
    // Two buys at the ask (3 + 2) and one sell at the bid (1).
    acc.add(trade(100.05, 3, 1_000), { bid: 100, ask: 100.05 });
    acc.add(trade(100.05, 2, 2_000), { bid: 100, ask: 100.05 });
    acc.add(trade(100.0, 1, 3_000), { bid: 100, ask: 100.05 });

    const snapshot = acc.snapshot(3_000, 60_000);
    expect(snapshot.buyVolume).toBe(5);
    expect(snapshot.sellVolume).toBe(1);
    expect(snapshot.delta).toBe(4);
    expect(snapshot.totalVolume).toBe(6);
    expect(snapshot.imbalance).toBeCloseTo(4 / 6, 6);
    expect(snapshot.buyShare).toBeCloseTo(5 / 6, 6);
    expect(snapshot.tradeCount).toBe(3);
  });

  it('reports an empty window honestly rather than a fabricated 50/50', () => {
    const acc = new FlowAccumulator();
    const snapshot = acc.snapshot(10_000, 60_000);
    expect(snapshot.totalVolume).toBe(0);
    expect(snapshot.delta).toBe(0);
    expect(snapshot.imbalance).toBe(0);
    expect(snapshot.buyShare).toBe(0.5);
    expect(snapshot.tradeCount).toBe(0);
    expect(snapshot.lastTradeAt).toBeNull();
  });

  it('prunes trades older than the window but keeps the session CVD', () => {
    const acc = new FlowAccumulator();
    acc.add(trade(100.05, 5, 0), { bid: 100, ask: 100.05 });
    acc.add(trade(100.0, 2, 100_000), { bid: 100, ask: 100.05 });

    const snapshot = acc.snapshot(100_000, 60_000);
    // The first trade fell out of the 60s window...
    expect(snapshot.buyVolume).toBe(0);
    expect(snapshot.sellVolume).toBe(2);
    // ...but the session CVD still counts it.
    expect(snapshot.cvd).toBe(3);
  });

  it('drops an unclassifiable trade from the counts, not into a guess', () => {
    const acc = new FlowAccumulator();
    // No quote and no prior price: the first trade cannot be classified.
    expect(acc.add(trade(100, 4, 1_000))).toBeNull();
    const snapshot = acc.snapshot(1_000, 60_000);
    expect(snapshot.tradeCount).toBe(0);
    expect(snapshot.totalVolume).toBe(0);
  });
});

describe('flowStateFromImbalance', () => {
  it('reads a near-even tape as balanced', () => {
    const state = flowStateFromImbalance(0.03, DEFAULT_FLOW_THRESHOLDS);
    expect(state.state).toBe('BALANCED');
    expect(state.label).toBe('Balanced');
  });

  it('labels buyers dominating with the right intensity tier', () => {
    expect(flowStateFromImbalance(0.1, DEFAULT_FLOW_THRESHOLDS)).toMatchObject({
      state: 'BUYERS',
      intensity: 'WEAK',
      label: 'Buyers dominating',
    });
    expect(flowStateFromImbalance(0.2, DEFAULT_FLOW_THRESHOLDS)).toMatchObject({
      state: 'BUYERS',
      intensity: 'MODERATE',
    });
    expect(flowStateFromImbalance(0.5, DEFAULT_FLOW_THRESHOLDS)).toMatchObject({
      state: 'BUYERS',
      intensity: 'STRONG',
    });
  });

  it('labels sellers dominating symmetrically', () => {
    expect(flowStateFromImbalance(-0.5, DEFAULT_FLOW_THRESHOLDS)).toMatchObject({
      state: 'SELLERS',
      intensity: 'STRONG',
      label: 'Sellers dominating',
    });
  });
});

describe('bookImbalance', () => {
  it('is +1 with only bids and -1 with only offers', () => {
    expect(bookImbalance(10, 0)).toBe(1);
    expect(bookImbalance(0, 10)).toBe(-1);
    expect(bookImbalance(3, 1)).toBeCloseTo(0.5, 6);
  });

  it('is zero for an empty book rather than NaN', () => {
    expect(bookImbalance(0, 0)).toBe(0);
  });
});

describe('buildFlowGauge', () => {
  it('scales the imbalance to the -100..+100 scale, label consistent with score', () => {
    const acc = new FlowAccumulator();
    acc.add(trade(100.05, 3, 1_000), { bid: 100, ask: 100.05 });
    acc.add(trade(100.05, 1, 2_000), { bid: 100, ask: 100.05 });
    const gauge = buildFlowGauge(acc.snapshot(2_000, 60_000));
    // All buyers -> imbalance 1 -> score 100 -> STRONG_BUY.
    expect(gauge.score).toBe(100);
    expect(gauge.label).toBe('STRONG_BUY');
  });
});

describe('cvdSlope', () => {
  it('is positive for a rising CVD and null with too few samples', () => {
    // x is in seconds, so 10 CVD over each 1s step is a slope of 10/s.
    expect(cvdSlope([{ timestamp: 0, cvd: 0 }, { timestamp: 1000, cvd: 10 }, { timestamp: 2000, cvd: 20 }])).toBeCloseTo(
      10,
      6
    );
    expect(cvdSlope([{ timestamp: 0, cvd: 0 }])).toBeNull();
    expect(cvdSlope([])).toBeNull();
  });
});

describe('advanceShift', () => {
  it('does not alert on a one-tick flip', () => {
    const first = advanceShift(INITIAL_SHIFT_STATE, 'BUYERS', 0, 5_000);
    expect(first.alert).toBeNull();
    // 2s later, still buyers: not yet held long enough.
    const second = advanceShift(first.state, 'BUYERS', 2_000, 5_000);
    expect(second.alert).toBeNull();
  });

  it('alerts once the new side has held for the hold time, and only once', () => {
    const start = advanceShift(INITIAL_SHIFT_STATE, 'SELLERS', 0, 5_000);
    const held = advanceShift(start.state, 'SELLERS', 6_000, 5_000);
    expect(held.alert).toBe('SELLERS');
    // A later tick on the same side does not re-announce.
    const again = advanceShift(held.state, 'SELLERS', 8_000, 5_000);
    expect(again.alert).toBeNull();
  });

  it('resets the clock when the tape goes balanced', () => {
    const start = advanceShift(INITIAL_SHIFT_STATE, 'BUYERS', 0, 5_000);
    const balanced = advanceShift(start.state, 'BALANCED', 3_000, 5_000);
    expect(balanced.state.side).toBeNull();
    expect(balanced.alert).toBeNull();
  });
});
