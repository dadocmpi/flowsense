import { useMemo } from 'react';
import type { Candle } from '../lib/indicators';
import { pointOfControl, volumeProfile } from '../lib/indicators';
import { SRLevel, ReversalSignal, SRReversalFactors } from '../types/srReversal';
import { FactorContribution } from '../types/compassEngine';
import type { MultiTimeframeResult } from './useMultiTimeframe';

const TOUCH_THRESHOLD_PCT = 0.001; // 0.1% of price

/**
 * Volume-based confirmation. Uses the last few candles against the window
 * average: expanding volume into a level suggests participation, contracting
 * volume after an extended move suggests exhaustion.
 */
function buildVolumeConfirmation(candles: Candle[]): ReversalSignal['volumeConfirmation'] {
  const volumes = candles.map(c => c.volume).filter(v => Number.isFinite(v) && v > 0);
  if (volumes.length < 6) {
    return { available: false, volumeRatio: 0, risingVolume: false, exhaustion: false };
  }

  const recent = volumes.slice(-3);
  const baseline = volumes.slice(0, -3);
  const avg = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
  if (avg <= 0) {
    return { available: false, volumeRatio: 0, risingVolume: false, exhaustion: false };
  }

  const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
  const volumeRatio = recentAvg / avg;
  const risingVolume = recent[2] > recent[1] && recent[1] > recent[0];

  // Exhaustion needs both contracting volume and a move already in progress.
  const firstClose = candles[candles.length - 6].close;
  const lastClose = candles[candles.length - 1].close;
  const movePct = firstClose > 0 ? Math.abs((lastClose - firstClose) / firstClose) * 100 : 0;

  return {
    available: true,
    volumeRatio: Number(volumeRatio.toFixed(2)),
    risingVolume,
    exhaustion: volumeRatio < 0.7 && movePct > 0.5,
  };
}

interface LevelSeed {
  type: SRLevel['type'];
  direction: SRLevel['direction'];
  price: number;
  strength: number;
  timeframe: string;
  confidence: number;
}

function buildLevelSeeds(candles: Candle[], ranges: { session?: { high: number; low: number } | null; previousDay?: { high: number; low: number } | null; weekly?: { high: number; low: number } | null; openingRange?: { high: number; low: number } | null }, price: number): LevelSeed[] {
  const seeds: LevelSeed[] = [];
  const push = (seed: LevelSeed) => {
    if (Number.isFinite(seed.price) && seed.price > 0) seeds.push(seed);
  };

  if (ranges.session) {
    push({ type: 'PREV_SESSION_HIGH', direction: 'RESISTANCE', price: ranges.session.high, strength: 70, timeframe: '1d', confidence: 65 });
    push({ type: 'PREV_SESSION_LOW', direction: 'SUPPORT', price: ranges.session.low, strength: 70, timeframe: '1d', confidence: 65 });
  }
  if (ranges.previousDay) {
    push({ type: 'PREV_DAY_HIGH', direction: 'RESISTANCE', price: ranges.previousDay.high, strength: 80, timeframe: '1d', confidence: 75 });
    push({ type: 'PREV_DAY_LOW', direction: 'SUPPORT', price: ranges.previousDay.low, strength: 80, timeframe: '1d', confidence: 75 });
  }
  if (ranges.weekly) {
    push({ type: 'WEEKLY_HIGH', direction: 'RESISTANCE', price: ranges.weekly.high, strength: 85, timeframe: '1w', confidence: 80 });
    push({ type: 'WEEKLY_LOW', direction: 'SUPPORT', price: ranges.weekly.low, strength: 85, timeframe: '1w', confidence: 80 });
  }
  if (ranges.openingRange) {
    push({ type: 'OPENING_RANGE_HIGH', direction: 'RESISTANCE', price: ranges.openingRange.high, strength: 55, timeframe: '15m', confidence: 55 });
    push({ type: 'OPENING_RANGE_LOW', direction: 'SUPPORT', price: ranges.openingRange.low, strength: 55, timeframe: '15m', confidence: 55 });
  }

  // Swing highs/lows from real candle wicks over the fetched window.
  const window = candles.slice(-100);
  if (window.length >= 20) {
    const swingHigh = Math.max(...window.map(c => c.high));
    const swingLow = Math.min(...window.map(c => c.low));
    push({ type: 'SWING_HIGH', direction: 'RESISTANCE', price: swingHigh, strength: 65, timeframe: '4h', confidence: 60 });
    push({ type: 'SWING_LOW', direction: 'SUPPORT', price: swingLow, strength: 65, timeframe: '4h', confidence: 60 });
  }

  // High-volume area from the real volume profile.
  const poc = pointOfControl(volumeProfile(candles.slice(-200), 40));
  if (poc) {
    push({
      type: 'HIGH_VOLUME_AREA',
      direction: poc.price > price ? 'RESISTANCE' : 'SUPPORT',
      price: poc.price,
      strength: 75,
      timeframe: '4h',
      confidence: 70,
    });
  }

  return seeds;
}

function toLevel(seed: LevelSeed, price: number, dataQuality: number): SRLevel {
  const threshold = price * TOUCH_THRESHOLD_PCT;
  const distance = Math.abs(price - seed.price);

  const zoneState: SRLevel['zoneState'] = distance <= threshold ? 'TOUCHING' : 'APPROACHING';
  const pricePosition: SRLevel['pricePosition'] =
    price > seed.price ? 'ABOVE' : price < seed.price ? 'BELOW' : 'INSIDE';

  return {
    id: `${seed.type}_${seed.price.toFixed(4)}`,
    type: seed.type,
    direction: seed.direction,
    priceLow: seed.price,
    priceHigh: seed.price,
    strength: seed.strength,
    timeframe: seed.timeframe,
    testCount: 0,
    freshness: 100,
    distanceFromPrice: distance,
    pricePosition,
    zoneState,
    invalidationLevel: seed.direction === 'SUPPORT' ? seed.price * 0.995 : seed.price * 1.005,
    confidence: seed.confidence,
    dataQuality,
  };
}

/**
 * Builds support/resistance levels and a reversal watch signal from real
 * candles. Confirmation uses traded volume; the live order book and tape are
 * surfaced separately in the order flow panel.
 */
export const useSrReversal = (
  candles: Candle[],
  price: number,
  dataQuality: number,
  ranges: {
    session?: { high: number; low: number } | null;
    previousDay?: { high: number; low: number } | null;
    weekly?: { high: number; low: number } | null;
    openingRange?: { high: number; low: number } | null;
  },
  mtfResult: MultiTimeframeResult | null
): SRReversalFactors => {
  return useMemo<SRReversalFactors>(() => {
    if (!price || price <= 0 || candles.length === 0) {
      return { factors: [], reversalSignal: null, srLevels: [] };
    }

    const seeds = buildLevelSeeds(candles, ranges, price);
    const levels = seeds.map(seed => toLevel(seed, price, dataQuality));

    // SR bias factor: nearby supports are bullish, nearby resistances bearish.
    const factors: FactorContribution[] = [];
    let buyWeight = 0;
    let sellWeight = 0;

    levels.forEach(level => {
      const proximity = level.distanceFromPrice <= price * 0.01;
      if (!proximity) return;

      const weighted = level.strength * (level.confidence / 100);
      if (level.direction === 'SUPPORT') buyWeight += weighted;
      else sellWeight += weighted;
    });

    const totalWeight = buyWeight + sellWeight;
    if (totalWeight > 0) {
      factors.push({
        category: 'SUPPORT_RESISTANCE',
        name: 'SR_ZONE_BIAS',
        direction: buyWeight > sellWeight ? 'BULLISH' : sellWeight > buyWeight ? 'BEARISH' : 'NEUTRAL',
        weight: Math.min(100, Math.round(totalWeight / 2)),
        value: `BUY ${Math.round(buyWeight)} / SELL ${Math.round(sellWeight)}`,
        confidence: Math.round((buyWeight + sellWeight) / 2),
      });
    }

    const touchingSupport = levels.filter(l => l.direction === 'SUPPORT' && l.zoneState === 'TOUCHING' && l.confidence >= 60);
    const touchingResistance = levels.filter(l => l.direction === 'RESISTANCE' && l.zoneState === 'TOUCHING' && l.confidence >= 60);

    let reversal: ReversalSignal | null = null;
    if (touchingSupport.length > 0 || touchingResistance.length > 0) {
      const atSupport = touchingSupport.length > 0;
      const reference = atSupport ? touchingSupport[0] : touchingResistance[0];

      const aligned = mtfResult
        ? mtfResult.timeframes.filter(t => (atSupport ? t.direction === 'BUY' : t.direction === 'SELL')).map(t => t.timeframe)
        : [];
      const conflicting = mtfResult
        ? mtfResult.timeframes.filter(t => (atSupport ? t.direction === 'SELL' : t.direction === 'BUY')).map(t => t.timeframe)
        : [];
      const unavailable = mtfResult ? [] : ['1m', '5m', '15m', '1h', '4h', '1d'];

      const confidence = Math.round(
        Math.max(30, Math.min(90, reference.confidence * 0.6 + (aligned.length / 6) * 40))
      );

      const volumeConfirmation = buildVolumeConfirmation(candles);

      reversal = {
        state: atSupport ? 'BULLISH_REVERSAL_WATCH' : 'BEARISH_REVERSAL_WATCH',
        reason: `Price touching ${atSupport ? 'support' : 'resistance'} at ${reference.priceLow.toFixed(2)}`,
        confidence,
        dataQuality,
        timestamp: Date.now(),
        price,
        previousDirection: 'NEUTRAL',
        currentDirection: atSupport ? 'BULLISH' : 'BEARISH',
        directionChangeReason: 'Price at a monitored S/R level',
        volumeConfirmation: volumeConfirmation,
        timeframeAgreement: { aligned, conflicting, unavailable },
        invalidation: {
          level: reference.invalidationLevel,
          distance: Math.abs(price - reference.invalidationLevel),
        },
        riskReward: { target: 0, stop: 0, ratio: 0 },
      };

      factors.push({
        category: 'REVERSAL',
        name: 'REVERSAL_SIGNAL',
        direction: atSupport ? 'BULLISH' : 'BEARISH',
        weight: Math.round(confidence / 2),
        value: `${reversal.state} (${confidence}%)`,
        confidence,
      });
    }

    return { factors, reversalSignal: reversal, srLevels: levels };
  }, [candles, price, dataQuality, ranges.session, ranges.previousDay, ranges.weekly, ranges.openingRange, mtfResult]);
};
