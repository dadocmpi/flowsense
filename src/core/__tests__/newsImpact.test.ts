// ============================================
// NEWS IMPACT CLASSIFICATION TESTS
// ============================================
// The classification is rule-based and pure, so it is pinned here: a provider's
// impact wording maps onto High/Medium/Low, an event is tagged with the assets it
// is KNOWN to move, and the event-risk flag turns red inside the 60/30 window.

import { describe, expect, it } from 'vitest';
import {
  affectsFor,
  affectsTrackedAssets,
  EVENT_RISK_LEAD_MINUTES,
  EVENT_RISK_TAIL_MINUTES,
  eventRiskFlag,
  nextHighImpactEvent,
  normalizeImpact,
} from '../news/impact';

describe('impact normalisation', () => {
  it('maps the provider wordings onto three levels', () => {
    expect(normalizeImpact('high')).toBe('High');
    expect(normalizeImpact('HIGH')).toBe('High');
    expect(normalizeImpact('3')).toBe('High');
    expect(normalizeImpact('medium')).toBe('Medium');
    expect(normalizeImpact('2')).toBe('Medium');
    expect(normalizeImpact('low')).toBe('Low');
  });

  it('treats an unknown or missing impact as Low', () => {
    expect(normalizeImpact(null)).toBe('Low');
    expect(normalizeImpact(undefined)).toBe('Low');
    expect(normalizeImpact('whatever')).toBe('Low');
  });
});

describe('affected assets', () => {
  it('tags a Fed event with USD, Gold and US indices', () => {
    expect(affectsFor('FOMC Statement')).toEqual(['USD', 'Gold', 'US indices']);
  });

  it('tags inflation data with USD, Gold and US indices', () => {
    expect(affectsFor('CPI (YoY)')).toEqual(['USD', 'Gold', 'US indices']);
    expect(affectsFor('PPI (MoM)')).toEqual(['USD', 'Gold', 'US indices']);
  });

  it('tags jobs data with USD and US indices', () => {
    expect(affectsFor('Non-Farm Payrolls')).toEqual(['USD', 'US indices']);
    expect(affectsFor('Unemployment Rate')).toEqual(['USD', 'US indices']);
  });

  it('tags an ECB event with USD only', () => {
    expect(affectsFor('ECB Interest Rate Decision')).toEqual(['USD']);
  });

  it('returns an empty list for an event we do not track', () => {
    expect(affectsFor('Some Regional Housing Print')).toEqual([]);
    expect(affectsTrackedAssets('Some Regional Housing Print')).toBe(false);
  });
});

describe('event-risk flag', () => {
  const now = Date.UTC(2024, 5, 10, 12, 0, 0);
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

  it('is red inside the lead window before a High-impact event', () => {
    expect(eventRiskFlag([{ time: at(30), impact: 'High' }], now)).toBe(true);
    expect(eventRiskFlag([{ time: at(EVENT_RISK_LEAD_MINUTES), impact: 'High' }], now)).toBe(true);
  });

  it('is red inside the tail window after a High-impact event', () => {
    expect(eventRiskFlag([{ time: at(-20), impact: 'High' }], now)).toBe(true);
    expect(eventRiskFlag([{ time: at(-EVENT_RISK_TAIL_MINUTES), impact: 'High' }], now)).toBe(true);
  });

  it('is neutral outside both windows', () => {
    expect(eventRiskFlag([{ time: at(90), impact: 'High' }], now)).toBe(false);
    expect(eventRiskFlag([{ time: at(-45), impact: 'High' }], now)).toBe(false);
  });

  it('ignores non-High events', () => {
    expect(eventRiskFlag([{ time: at(10), impact: 'Medium' }], now)).toBe(false);
    expect(eventRiskFlag([{ time: at(10), impact: 'Low' }], now)).toBe(false);
  });
});

describe('next high-impact event', () => {
  const now = Date.UTC(2024, 5, 10, 12, 0, 0);
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

  it('returns the soonest High-impact event still ahead', () => {
    const events = [
      { time: at(120), impact: 'High' as const, name: 'later' },
      { time: at(-10), impact: 'High' as const, name: 'past' },
      { time: at(30), impact: 'High' as const, name: 'soon' },
      { time: at(20), impact: 'Medium' as const, name: 'medium' },
    ];
    expect(nextHighImpactEvent(events, now)?.name).toBe('soon');
  });

  it('returns null when there is no High-impact event ahead', () => {
    expect(nextHighImpactEvent([{ time: at(-5), impact: 'High' as const }], now)).toBeNull();
    expect(nextHighImpactEvent([], now)).toBeNull();
  });
});
