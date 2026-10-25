// ============================================
// MARKET STRUCTURE (lightweight SMC read)
// ============================================
// Swing highs/lows, the last break of structure (BOS), the last change of
// character (CHoCH) and where price sits inside the most recent swing range
// (premium / discount).
//
// Definitions used here, stated plainly:
//   swing high  a candle whose high is the highest of the `lookback` candles
//               on each side of it (fractal pivot).
//   BOS         price closing beyond the most recent confirmed swing extreme
//               in the direction the structure was already heading.
//   CHoCH       price closing beyond the swing extreme in the OPPOSITE
//               direction to the previous break — the first sign of a reversal.
//
// Everything is computed from the candles only. No order-book inference.

import type { Candle, MarketStructure } from './types';

export interface SwingPoint {
  index: number;
  price: number;
  kind: 'HIGH' | 'LOW';
}

/** Fractal swing pivots. `lookback` candles are required on each side. */
export function findSwings(candles: Candle[], lookback = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < lookback * 2 + 1) return swings;

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const high = candles[i].high;
    const low = candles[i].low;

    const isSwingHigh = window.every(c => c.high <= high);
    const isSwingLow = window.every(c => c.low >= low);

    if (isSwingHigh) swings.push({ index: i, price: high, kind: 'HIGH' });
    else if (isSwingLow) swings.push({ index: i, price: low, kind: 'LOW' });
  }

  return swings;
}

/**
 * Walk the series once, tracking the most recent confirmed swing high and low,
 * and record every break as it happens. The last BOS and CHoCH are kept.
 */
export function analyzeMarketStructure(candles: Candle[], lookback = 2): MarketStructure {
  const empty: MarketStructure = {
    swingHigh: null,
    swingLow: null,
    lastBos: null,
    lastChoch: null,
    zone: 'UNKNOWN',
    rangePosition: null,
    rangeHigh: null,
    rangeLow: null,
  };
  if (candles.length < lookback * 2 + 2) return empty;

  const swings = findSwings(candles, lookback);
  if (swings.length === 0) return empty;

  // Latest confirmed swing of each kind is the structure reference.
  const lastHighSwing = [...swings].reverse().find(s => s.kind === 'HIGH') ?? null;
  const lastLowSwing = [...swings].reverse().find(s => s.kind === 'LOW') ?? null;

  let lastBos: MarketStructure['lastBos'] = null;
  let lastChoch: MarketStructure['lastChoch'] = null;
  let structureBias: 'BULLISH' | 'BEARISH' | null = null;

  // Replay the series, arming each side as its swing is confirmed, and record
  // the first close beyond an armed level.
  let armedHigh: SwingPoint | null = null;
  let armedLow: SwingPoint | null = null;
  let swingCursor = 0;

  for (let i = 0; i < candles.length; i++) {
    // Confirm any swing whose right-side window has fully closed by candle i.
    while (swingCursor < swings.length && swings[swingCursor].index + lookback <= i) {
      const swing = swings[swingCursor];
      if (swing.kind === 'HIGH') armedHigh = swing;
      else armedLow = swing;
      swingCursor += 1;
    }

    const close = candles[i].close;

    if (armedHigh && close > armedHigh.price) {
      if (structureBias === 'BEARISH') lastChoch = 'BULLISH';
      else lastBos = 'BULLISH';
      structureBias = 'BULLISH';
      armedHigh = null;
    } else if (armedLow && close < armedLow.price) {
      if (structureBias === 'BULLISH') lastChoch = 'BEARISH';
      else lastBos = 'BEARISH';
      structureBias = 'BEARISH';
      armedLow = null;
    }
  }

  // Premium / discount: where price sits between the most recent opposing
  // swing low and swing high. Above the midpoint is premium, below is discount.
  const swingHighPrice = lastHighSwing?.price ?? null;
  const swingLowPrice = lastLowSwing?.price ?? null;
  const price = candles[candles.length - 1].close;

  let zone: MarketStructure['zone'] = 'UNKNOWN';
  let rangePosition: number | null = null;

  if (swingHighPrice !== null && swingLowPrice !== null && swingHighPrice > swingLowPrice) {
    const raw = ((price - swingLowPrice) / (swingHighPrice - swingLowPrice)) * 100;
    // Clamp for display: price can trade outside the last swing range, but the
    // position bar is a 0-100 scale.
    rangePosition = Math.max(0, Math.min(100, raw));
    if (raw > 55) zone = 'PREMIUM';
    else if (raw < 45) zone = 'DISCOUNT';
    else zone = 'EQUILIBRIUM';
  }

  return {
    swingHigh: swingHighPrice,
    swingLow: swingLowPrice,
    lastBos,
    lastChoch,
    zone,
    rangePosition,
    rangeHigh: swingHighPrice,
    rangeLow: swingLowPrice,
  };
}
