// ============================================
// TWELVE DATA ADAPTER TESTS
// ============================================
// The adapter is the boundary where a vendor payload becomes candles, so it is
// tested against the vendor's own documented response shape.

import { describe, expect, it } from 'vitest';
import { normalizeDatetime, parseTimeSeries, TWELVEDATA_INTERVALS } from '../twelvedata';

describe('TWELVEDATA_INTERVALS', () => {
  it('maps every app timeframe the UI offers', () => {
    for (const timeframe of ['5m', '15m', '30m', '1h', '4h', '1D', '1W']) {
      expect(TWELVEDATA_INTERVALS[timeframe]).toBeTruthy();
    }
    expect(TWELVEDATA_INTERVALS['1D']).toBe('1day');
    expect(TWELVEDATA_INTERVALS['1W']).toBe('1week');
  });
});

describe('normalizeDatetime', () => {
  it('anchors a bare date at midnight UTC', () => {
    expect(normalizeDatetime('2024-06-10')).toBe('2024-06-10 00:00:00');
  });

  it('passes through a full timestamp', () => {
    expect(normalizeDatetime('2024-06-10 13:30:00')).toBe('2024-06-10 13:30:00');
  });

  it('adds seconds when the vendor omits them', () => {
    expect(normalizeDatetime('2024-06-10 13:30')).toBe('2024-06-10 13:30:00');
  });

  it('converts an ISO timestamp to the shared form', () => {
    expect(normalizeDatetime('2024-06-10T13:30:00Z')).toBe('2024-06-10 13:30:00');
  });
});

describe('parseTimeSeries', () => {
  it('reverses the vendor order so candles come out oldest-first', () => {
    const candles = parseTimeSeries({
      values: [
        { datetime: '2024-06-10 13:35:00', open: '101', high: '102', low: '100', close: '101.5', volume: '20' },
        { datetime: '2024-06-10 13:30:00', open: '100', high: '101', low: '99', close: '100.5', volume: '10' },
      ],
    });
    expect(candles.map(c => c.datetime)).toEqual(['2024-06-10 13:30:00', '2024-06-10 13:35:00']);
  });

  it('parses the numeric fields', () => {
    const candles = parseTimeSeries({
      values: [{ datetime: '2024-06-10', open: '2330.5', high: '2350', low: '2320', close: '2345.25', volume: '1234' }],
    });
    expect(candles[0]).toEqual({
      datetime: '2024-06-10 00:00:00',
      open: 2330.5,
      high: 2350,
      low: 2320,
      close: 2345.25,
      volume: 1234,
    });
  });

  it('does not attach a taker-buy split, because the vendor does not report one', () => {
    const candles = parseTimeSeries({
      values: [{ datetime: '2024-06-10', open: '1', high: '2', low: '1', close: '2', volume: '10' }],
    });
    expect(candles[0].takerBuyVolume).toBeUndefined();
  });

  it('throws the vendor message when the API reports an error', () => {
    expect(() => parseTimeSeries({ status: 'error', message: 'symbol not found' })).toThrow('symbol not found');
  });

  it('throws when there are no values', () => {
    expect(() => parseTimeSeries({})).toThrow(/no values/i);
  });

  it('drops bars without a usable close rather than inventing one', () => {
    const candles = parseTimeSeries({
      values: [
        { datetime: '2024-06-10', open: '1', high: '2', low: '1', close: '', volume: '10' },
        { datetime: '2024-06-11', open: '1', high: '2', low: '1', close: '0', volume: '10' },
        { datetime: '2024-06-12', open: '1', high: '2', low: '1', close: '5', volume: '10' },
      ],
    });
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(5);
  });

  it('returns nothing for an empty value list', () => {
    expect(parseTimeSeries({ values: [] })).toEqual([]);
  });
});
