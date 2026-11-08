import { describe, expect, it } from 'vitest';
import {
  buildVolumeProfile,
  chooseBinSize,
  niceStep,
  DEFAULT_VOLUME_PROFILE_CONFIG,
} from '../volumeProfile';
import type { TradePrint } from '../orderflow/types';

function print(price: number, qty: number, side: 'BUY' | 'SELL' = 'BUY', time = 1_000): TradePrint {
  return { id: time, time, price, qty, buyerIsMaker: side === 'SELL', side };
}

describe('bin sizing', () => {
  it('uses the configured tick when one is given', () => {
    expect(chooseBinSize(50, { tickSize: 0.1, targetBins: 60, valueAreaShare: 0.7 })).toBe(0.1);
  });

  it('derives a nice step from the range otherwise', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(120)).toBe(200);
  });
});

describe('volume profile POC / VAH / VAL', () => {
  it('puts the POC on the busiest price and encloses 70% of volume', () => {
    // 100 lots at 10, 20 at 11, 10 at 12 -> POC 10, value area centred there.
    const prints = [
      ...Array.from({ length: 100 }, () => print(10, 1)),
      ...Array.from({ length: 20 }, () => print(11, 1)),
      ...Array.from({ length: 10 }, () => print(12, 1)),
    ];
    const profile = buildVolumeProfile(prints, { tickSize: 1, targetBins: 60, valueAreaShare: 0.7 });
    expect(profile.available).toBe(true);
    expect(profile.totalVolume).toBe(130);
    // POC bin is [10,11) -> mid 10.5
    expect(profile.poc).toBeCloseTo(10.5, 6);
    // Value area must cover at least 70% of 130 = 91 -> POC bin (100) suffices.
    expect(profile.val).toBeCloseTo(10, 6);
    expect(profile.vah).toBeCloseTo(11, 6);
  });

  it('expands the value area when the POC bin alone is under the share', () => {
    // Even volume across three adjacent prices: POC bin covers 1/3, so it must
    // grow to reach 70%.
    const prints = [
      ...Array.from({ length: 10 }, () => print(100, 1)),
      ...Array.from({ length: 10 }, () => print(101, 1)),
      ...Array.from({ length: 10 }, () => print(102, 1)),
    ];
    const profile = buildVolumeProfile(prints, { tickSize: 1, targetBins: 60, valueAreaShare: 0.7 });
    const covered = profile.bins.filter(b => b.inValueArea).reduce((s, b) => s + b.total, 0);
    expect(covered / profile.totalVolume).toBeGreaterThanOrEqual(0.7);
    expect(profile.val).toBe(100);
    expect(profile.vah).toBe(103);
  });

  it('splits buy and sell volume by aggressor side', () => {
    const prints = [print(50, 3, 'BUY'), print(50, 1, 'SELL')];
    const profile = buildVolumeProfile(prints, { tickSize: 1, targetBins: 60, valueAreaShare: 0.7 });
    const bin = profile.bins.find(b => b.total > 0)!;
    expect(bin.buy).toBe(3);
    expect(bin.sell).toBe(1);
  });

  it('bounds prints to the session and reports session high/low', () => {
    const sessionStart = 1_000;
    const prints = [print(10, 1, 'BUY', 500), print(20, 1, 'BUY', 1_500)];
    const profile = buildVolumeProfile(prints, DEFAULT_VOLUME_PROFILE_CONFIG, sessionStart);
    expect(profile.totalVolume).toBe(1);
    expect(profile.sessionHigh).toBe(20);
    expect(profile.sessionLow).toBe(20);
  });

  it('takes session high/low from candles when supplied', () => {
    const prints = [print(10, 1)];
    const candles = [{ datetime: '2026-11-08 00:00:00', open: 9, high: 12, low: 8, close: 10, volume: 1 }];
    const profile = buildVolumeProfile(prints, DEFAULT_VOLUME_PROFILE_CONFIG, null, candles);
    expect(profile.sessionHigh).toBe(12);
    expect(profile.sessionLow).toBe(8);
  });

  it('is unavailable, not zeroed, with no prints', () => {
    const profile = buildVolumeProfile([], DEFAULT_VOLUME_PROFILE_CONFIG, 1_000);
    expect(profile.available).toBe(false);
    expect(profile.poc).toBeNull();
    expect(profile.vah).toBeNull();
    expect(profile.val).toBeNull();
    expect(profile.bins).toEqual([]);
  });
});

describe('buildVolumeProfileFromHistogram (live path)', () => {
  it('produces the same POC/value-area result as the print path', async () => {
    const { buildVolumeProfileFromHistogram } = await import('../volumeProfile');
    const { PriceHistogram } = await import('../orderflow/histogram');
    const prints = [
      ...Array.from({ length: 100 }, () => print(10, 1)),
      ...Array.from({ length: 20 }, () => print(11, 1)),
      ...Array.from({ length: 10 }, () => print(12, 1)),
    ];
    const hist = new PriceHistogram(1);
    for (const p of prints) hist.ingest(p);
    const fromPrints = buildVolumeProfile(prints, { tickSize: 1, targetBins: 60, valueAreaShare: 0.7 });
    const fromHist = buildVolumeProfileFromHistogram(hist.entries(), 1, { tickSize: 1, targetBins: 60, valueAreaShare: 0.7 });
    expect(fromHist.poc).toBe(fromPrints.poc);
    expect(fromHist.vah).toBe(fromPrints.vah);
    expect(fromHist.val).toBe(fromPrints.val);
    expect(fromHist.totalVolume).toBe(fromPrints.totalVolume);
  });

  it('is unavailable, not zeroed, for an empty histogram', async () => {
    const { buildVolumeProfileFromHistogram } = await import('../volumeProfile');
    const profile = buildVolumeProfileFromHistogram([], 0.01);
    expect(profile.available).toBe(false);
    expect(profile.poc).toBeNull();
  });
});
