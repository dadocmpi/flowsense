// ============================================================================
// INSTITUTIONAL ZONE ENGINE
// ============================================================================
// Detects FVG, Order Blocks, Breaker Blocks, liquidity sweeps, POC.
// Returns raw zones that are later clustered into ConfluenceZones.

import { InstitutionalZone, ZoneDirection, ZoneSource, ZoneStatus, Timeframe } from './types';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface ZoneConfig {
  /** Minimum size (price units) for a zone to be considered. */
  minZoneSize: number;
  /** Lookback for FVG detection. */
  fvgLookback: number;
  /** Volume threshold multiplier for OB detection. */
  obVolumeMultiplier: number;
  /** Whether to detect bullish and bearish OBs. */
  detectBullishOB: boolean;
  detectBearishOB: boolean;
}

export const DEFAULT_ZONE_CONFIG: ZoneConfig = {
  minZoneSize: 0.1,
  fvgLookback: 50,
  obVolumeMultiplier: 1.5,
  detectBullishOB: true,
  detectBearishOB: true,
};

/**
 * Detect Fair Value Gaps (FVG).
 * Bullish FVG: low[i] > high[i-2] (gap up between i-2 and i)
 * Bearish FVG: high[i] < low[i-2] (gap down)
 */
export function detectFVG(
  candles: Candle[],
  config: ZoneConfig = DEFAULT_ZONE_CONFIG
): InstitutionalZone[] {
  const zones: InstitutionalZone[] = [];
  const start = Math.max(2, candles.length - config.fvgLookback);

  for (let i = start; i < candles.length; i++) {
    const prev2 = candles[i - 2];
    const curr = candles[i];

    // Bullish FVG
    if (curr.low > prev2.high) {
      const high = curr.low;
      const low = prev2.high;
      if (high - low >= config.minZoneSize) {
        zones.push({
          id: `fvg-bull-${i}`,
          source: 'FVG',
          direction: 'BULLISH',
          timeframe: 'LTF',
          high,
          low,
          mid: (high + low) / 2,
          createdAt: curr.timestamp,
          status: 'ACTIVE',
          testedCount: 0,
          strength: 0.7,
          notes: `Bullish FVG formed at ${new Date(curr.timestamp).toISOString()}`,
        });
      }
    }

    // Bearish FVG
    if (curr.high < prev2.low) {
      const high = prev2.low;
      const low = curr.high;
      if (high - low >= config.minZoneSize) {
        zones.push({
          id: `fvg-bear-${i}`,
          source: 'FVG',
          direction: 'BEARISH',
          timeframe: 'LTF',
          high,
          low,
          mid: (high + low) / 2,
          createdAt: curr.timestamp,
          status: 'ACTIVE',
          testedCount: 0,
          strength: 0.7,
          notes: `Bearish FVG formed at ${new Date(curr.timestamp).toISOString()}`,
        });
      }
    }
  }

  return zones;
}

/**
 * Detect Order Blocks.
 * Bullish OB: last down candle before a strong bullish move.
 * Bearish OB: last up candle before a strong bearish move.
 */
export function detectOrderBlocks(
  candles: Candle[],
  config: ZoneConfig = DEFAULT_ZONE_CONFIG
): InstitutionalZone[] {
  const zones: InstitutionalZone[] = [];
  if (candles.length < 5) return zones;

  // Calculate average volume for threshold
  const avgVol = candles.reduce((s, c) => s + c.volume, 0) / candles.length;
  const volThreshold = avgVol * config.obVolumeMultiplier;

  for (let i = 2; i < candles.length - 2; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    const next2 = candles[i + 2];

    const isDownCandle = curr.close < curr.open;
    const isUpCandle = curr.close > curr.open;
    const nextIsStrongUp = next.close > curr.high && next.volume > volThreshold;
    const nextIsStrongDown = next.close < curr.low && next.volume > volThreshold;
    const next2ConfirmsUp = next2.close > next.close;
    const next2ConfirmsDown = next2.close < next.close;

    // Bullish OB: last down candle before strong up move
    if (
      config.detectBullishOB &&
      isDownCandle &&
      nextIsStrongUp &&
      (next2ConfirmsUp || next2.close > next.high)
    ) {
      zones.push({
        id: `ob-bull-${i}`,
        source: 'ORDER_BLOCK',
        direction: 'BULLISH',
        timeframe: 'LTF',
        high: curr.high,
        low: curr.low,
        mid: (curr.high + curr.low) / 2,
        createdAt: curr.timestamp,
        status: 'ACTIVE',
        testedCount: 0,
        strength: 0.85,
        notes: 'Bullish Order Block - last down candle before impulsive up move',
      });
    }

    // Bearish OB: last up candle before strong down move
    if (
      config.detectBearishOB &&
      isUpCandle &&
      nextIsStrongDown &&
      (next2ConfirmsDown || next2.close < next.low)
    ) {
      zones.push({
        id: `ob-bear-${i}`,
        source: 'ORDER_BLOCK',
        direction: 'BEARISH',
        timeframe: 'LTF',
        high: curr.high,
        low: curr.low,
        mid: (curr.high + curr.low) / 2,
        createdAt: curr.timestamp,
        status: 'ACTIVE',
        testedCount: 0,
        strength: 0.85,
        notes: 'Bearish Order Block - last up candle before impulsive down move',
      });
    }
  }

  return zones;
}

/**
 * Detect Breaker Blocks.
 * A failed Order Block that price breaks through and reverses.
 * Bullish Breaker: former bearish OB that price broke up through.
 */
export function detectBreakerBlocks(
  candles: Candle[],
  existingOBs: InstitutionalZone[]
): InstitutionalZone[] {
  const zones: InstitutionalZone[] = [];
  if (candles.length < 3) return zones;

  const lastCandle = candles[candles.length - 1];

  for (const ob of existingOBs) {
    if (ob.status !== 'ACTIVE') continue;

    // Bullish Breaker: bearish OB that price broke up through
    if (ob.direction === 'BEARISH' && lastCandle.close > ob.high) {
      zones.push({
        id: `brk-bull-${ob.id}`,
        source: 'BREAKER',
        direction: 'BULLISH',
        timeframe: ob.timeframe,
        high: ob.high + (ob.high - ob.low) * 0.5, // projection
        low: ob.high,
        mid: (ob.high + ob.low) / 2,
        createdAt: lastCandle.timestamp,
        status: 'ACTIVE',
        testedCount: 0,
        strength: 0.6,
        notes: 'Bullish Breaker - former bearish OB broken upside',
      });
    }

    // Bearish Breaker: bullish OB that price broke down through
    if (ob.direction === 'BULLISH' && lastCandle.close < ob.low) {
      zones.push({
        id: `brk-bear-${ob.id}`,
        source: 'BREAKER',
        direction: 'BEARISH',
        timeframe: ob.timeframe,
        high: ob.low,
        low: ob.low - (ob.high - ob.low) * 0.5,
        mid: (ob.high + ob.low) / 2,
        createdAt: lastCandle.timestamp,
        status: 'ACTIVE',
        testedCount: 0,
        strength: 0.6,
        notes: 'Bearish Breaker - former bullish OB broken downside',
      });
    }
  }

  return zones;
}

/**
 * Detect liquidity sweeps (stop hunts) - price wicks through a level
 * and closes back on the other side.
 */
export function detectLiquiditySweeps(candles: Candle[]): InstitutionalZone[] {
  const zones: InstitutionalZone[] = [];
  if (candles.length < 3) return zones;

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];

    // Bullish sweep: wick below prev low, close back above
    if (curr.low < prev.low && curr.close > prev.low) {
      zones.push({
        id: `liq-sweep-bull-${i}`,
        source: 'LIQUIDITY',
        direction: 'BULLISH',
        timeframe: 'LTF',
        high: curr.close,
        low: curr.low,
        mid: (curr.close + curr.low) / 2,
        createdAt: curr.timestamp,
        status: 'ACTIVE',
        testedCount: 0,
        strength: 0.75,
        notes: 'Bullish liquidity sweep - wick below prior low',
      });
    }

    // Bearish sweep: wick above prev high, close back below
    if (curr.high > prev.high && curr.close < prev.high) {
      zones.push({
        id: `liq-sweep-bear-${i}`,
        source: 'LIQUIDITY',
        direction: 'BEARISH',
        timeframe: 'LTF',
        high: curr.high,
        low: curr.close,
        mid: (curr.close + curr.high) / 2,
        createdAt: curr.timestamp,
        status: 'ACTIVE',
        testedCount: 0,
        strength: 0.75,
        notes: 'Bearish liquidity sweep - wick above prior high',
      });
    }
  }

  return zones;
}

/**
 * Detect Point of Control (POC) via simplified volume profile.
 * Groups price into bins, finds highest-volume bin.
 */
export function detectPOC(
  candles: Candle[],
  binSize: number = 1.0
): InstitutionalZone[] {
  if (candles.length < 10) return [];

  // Find price range
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const numBins = Math.max(1, Math.ceil((maxPrice - minPrice) / binSize));

  // Distribute volume across bins using typical price
  const volumeBins = new Array(numBins).fill(0);
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const binIndex = Math.min(numBins - 1, Math.floor((typical - minPrice) / binSize));
    volumeBins[binIndex] += c.volume;
  }

  // Find highest volume bin
  const maxVol = Math.max(...volumeBins);
  const pocBin = volumeBins.indexOf(maxVol);
  const pocPrice = minPrice + pocBin * binSize + binSize / 2;

  return [
    {
      id: 'poc-main',
      source: 'POC',
      direction: 'NEUTRAL',
      timeframe: 'LTF',
      high: pocPrice + binSize,
      low: pocPrice - binSize,
      mid: pocPrice,
      createdAt: Date.now(),
      status: 'ACTIVE',
      testedCount: 0,
      strength: 0.65,
      notes: 'Point of Control - highest volume price level',
    },
  ];
}

/**
 * Detect structural support/resistance from swing points.
 */
export function detectStructuralSR(swings: { highs: { price: number }[]; lows: { price: number }[] }): InstitutionalZone[] {
  const zones: InstitutionalZone[] = [];

  // Cluster nearby highs into resistance zones
  const sortedHighs = [...swings.highs].map(h => h.price).sort((a, b) => b - a);
  const sortedLows = [...swings.lows].map(l => l.price).sort((a, b) => a - b);

  // Simple clustering: group within 1% of each other
  const clusterThreshold = 0.005;
  const clusteredHighs: number[][] = [];
  for (const p of sortedHighs) {
    const last = clusteredHighs[clusteredHighs.length - 1];
    if (last && Math.abs(p - last[0]) / last[0] < clusterThreshold) {
      last.push(p);
    } else {
      clusteredHighs.push([p]);
    }
  }
  const clusteredLows: number[][] = [];
  for (const p of sortedLows) {
    const last = clusteredLows[clusteredLows.length - 1];
    if (last && Math.abs(p - last[0]) / last[0] < clusterThreshold) {
      last.push(p);
    } else {
      clusteredLows.push([p]);
    }
  }

  for (const cluster of clusteredHighs) {
    if (cluster.length >= 2) {
      const avg = cluster.reduce((a, b) => a + b, 0) / cluster.length;
      zones.push({
        id: `sr-res-${avg.toFixed(2)}`,
        source: 'STRUCTURAL_SR',
        direction: 'BEARISH',
        timeframe: 'LTF',
        high: avg * 1.002,
        low: avg * 0.998,
        mid: avg,
        createdAt: Date.now(),
        status: 'ACTIVE',
        testedCount: cluster.length,
        strength: Math.min(0.9, 0.5 + cluster.length * 0.1),
        notes: `Structural Resistance (${cluster.length} touches)`,
      });
    }
  }

  for (const cluster of clusteredLows) {
    if (cluster.length >= 2) {
      const avg = cluster.reduce((a, b) => a + b, 0) / cluster.length;
      zones.push({
        id: `sr-sup-${avg.toFixed(2)}`,
        source: 'STRUCTURAL_SR',
        direction: 'BULLISH',
        timeframe: 'LTF',
        high: avg * 1.002,
        low: avg * 0.998,
        mid: avg,
        createdAt: Date.now(),
        status: 'ACTIVE',
        testedCount: cluster.length,
        strength: Math.min(0.9, 0.5 + cluster.length * 0.1),
        notes: `Structural Support (${cluster.length} touches)`,
      });
    }
  }

  return zones;
}

/**
 * Main entry point: detect all institutional zones from candle data.
 */
export function detectAllZones(
  candles: Candle[],
  config: ZoneConfig = DEFAULT_ZONE_CONFIG,
  swings?: { highs: { price: number }[]; lows: { price: number }[] }
): InstitutionalZone[] {
  const fvgs = detectFVG(candles, config);
  const obs = detectOrderBlocks(candles, config);
  const breakers = detectBreakerBlocks(candles, obs);
  const sweeps = detectLiquiditySweeps(candles);
  const pocs = detectPOC(candles);
  const sr = swings ? detectStructuralSR(swings) : [];

  return [...fvgs, ...obs, ...breakers, ...sweeps, ...pocs, ...sr];
}