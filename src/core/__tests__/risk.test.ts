import { describe, expect, it } from 'vitest';
import { lossTracker, positionSize, sessionStates } from '../risk';

describe('positionSize', () => {
  it('computes lot size for gold: 100 oz per lot', () => {
    // $10,000 balance, 1% risk = $100, 5.00 stop, 100 oz/lot.
    // units = 100 / 5 = 20 oz; lots = 20 / 100 = 0.20
    const result = positionSize({ balance: 10_000, riskPercent: 1, stopDistance: 5, contractMultiplier: 100 });
    expect(result.valid).toBe(true);
    expect(result.riskAmount).toBe(100);
    expect(result.units).toBeCloseTo(20, 6);
    expect(result.lots).toBeCloseTo(0.2, 6);
  });

  it('honours an edited contract multiplier', () => {
    const result = positionSize({ balance: 10_000, riskPercent: 1, stopDistance: 5, contractMultiplier: 50 });
    expect(result.lots).toBeCloseTo(0.4, 6);
  });

  it('reports why it cannot size rather than guessing', () => {
    expect(positionSize({ balance: 0, riskPercent: 1, stopDistance: 5, contractMultiplier: 100 }).reason).toBe(
      'Enter an account balance'
    );
    expect(positionSize({ balance: 1, riskPercent: 1, stopDistance: 0, contractMultiplier: 100 }).valid).toBe(false);
  });
});

describe('lossTracker', () => {
  it('reports the remaining daily and drawdown buffers', () => {
    const result = lossTracker({
      balance: 10_000,
      dailyLossLimitPercent: 3,
      dailyLossTaken: 120,
      maxDrawdownPercent: 6,
      peakEquity: 10_500,
      currentEquity: 10_200,
    });
    expect(result.dailyLimitAmount).toBe(300);
    expect(result.dailyBuffer).toBe(180);
    expect(result.dailyUsedShare).toBeCloseTo(0.4, 6);
    expect(result.drawdownLimitAmount).toBeCloseTo(630, 6);
    expect(result.drawdownAmount).toBeCloseTo(300, 6);
    expect(result.drawdownBuffer).toBeCloseTo(330, 6);
    expect(result.dailyBreached).toBe(false);
  });

  it('flags a breached limit', () => {
    const result = lossTracker({
      balance: 10_000,
      dailyLossLimitPercent: 1,
      dailyLossTaken: 150,
      maxDrawdownPercent: 0,
      peakEquity: 10_000,
      currentEquity: 10_000,
    });
    expect(result.dailyBreached).toBe(true);
  });
});

describe('sessionStates', () => {
  it('marks London and New York open at 13:00 UTC on a weekday', () => {
    const states = sessionStates(Date.UTC(2026, 10, 9, 13, 0, 0)); // Monday
    const byName = Object.fromEntries(states.map(s => [s.name, s.open]));
    expect(byName.Asia).toBe(false);
    expect(byName.London).toBe(true);
    expect(byName['New York']).toBe(true);
  });

  it('marks everything closed at the weekend', () => {
    const states = sessionStates(Date.UTC(2026, 10, 7, 13, 0, 0)); // Saturday
    expect(states.every(s => !s.open)).toBe(true);
  });

  it('reports progress through an open session', () => {
    const states = sessionStates(Date.UTC(2026, 10, 9, 12, 0, 0)); // Monday 12:00
    const london = states.find(s => s.name === 'London')!;
    // 07:00-16:00 -> 5 of 9 hours elapsed
    expect(london.progress).toBeCloseTo(5 / 9, 4);
  });
});
