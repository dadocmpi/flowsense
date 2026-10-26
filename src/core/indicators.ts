// ============================================
// PURE INDICATOR MATH
// ============================================
// Every function here is a pure function of its inputs: no I/O, no clock, no
// randomness. They are the only source of numeric readings in the app, so the
// unit tests in src/core/__tests__ pin them against hand-computed values.

import type { Candle } from './types';

export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function closes(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((acc, v) => acc + v, 0) / period;
}

/**
 * Exponential moving average series, seeded with the SMA of the first
 * `period` values (the standard convention). Returns one value per input from
 * the seed onwards, so `series[i]` corresponds to `values[period - 1 + i]`.
 */
export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const series: number[] = [values.slice(0, period).reduce((acc, v) => acc + v, 0) / period];

  for (let i = period; i < values.length; i++) {
    const previous = series[series.length - 1];
    series.push((values[i] - previous) * multiplier + previous);
  }

  return series;
}

/** Last value of the EMA series. */
export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

/**
 * Wilder's Relative Strength Index. Returns the last RSI of the series, or
 * null when there is not enough data (`period + 1` values).
 */
export function rsiSeries(values: number[], period = 14): number[] {
  if (period <= 0 || values.length < period + 1) return [];

  const out: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const push = () => {
    if (avgLoss === 0) {
      out.push(avgGain === 0 ? 50 : 100);
      return;
    }
    const rs = avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  };

  push();

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    push();
  }

  return out;
}

export function rsi(values: number[], period = 14): number | null {
  const series = rsiSeries(values, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

/** Rolling highest high over the last `period` candles. */
export function highest(candles: Candle[], period: number, key: 'high' | 'low' | 'close' = 'high'): number | null {
  if (period <= 0 || candles.length < period) return null;
  return Math.max(...candles.slice(-period).map(c => c[key]));
}

/** Rolling lowest low over the last `period` candles. */
export function lowest(candles: Candle[], period: number, key: 'high' | 'low' | 'close' = 'low'): number | null {
  if (period <= 0 || candles.length < period) return null;
  return Math.min(...candles.slice(-period).map(c => c[key]));
}

export interface StochasticResult {
  k: number;
  d: number;
}

/**
 * Slow stochastic. `%K` is the raw fast stochastic over `kPeriod` smoothed by
 * `smoothPeriod`; `%D` is a 3-period SMA of `%K`.
 */
export function stochastic(candles: Candle[], kPeriod = 9, smoothPeriod = 6): StochasticResult | null {
  if (candles.length < kPeriod + smoothPeriod) return null;

  const rawK: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const window = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const close = candles[i].close;
    rawK.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
  }

  const k = sma(rawK, smoothPeriod);
  const d = sma(rawK, smoothPeriod + 2); // %D = 3-period SMA of %K
  if (k === null || d === null) return null;

  return { k, d };
}

export interface StochRsiResult {
  k: number;
  d: number;
}

/**
 * Stochastic RSI: where the current RSI sits inside its own recent range,
 * expressed 0-100, then smoothed by 3 (`%K`) and 3 again (`%D`).
 */
export function stochasticRsi(values: number[], period = 14, smooth = 3): StochRsiResult | null {
  const series = rsiSeries(values, period);
  if (series.length < period) return null;

  const raw: number[] = [];
  for (let i = period - 1; i < series.length; i++) {
    const window = series.slice(i - period + 1, i + 1);
    const high = Math.max(...window);
    const low = Math.min(...window);
    raw.push(high === low ? 50 : ((series[i] - low) / (high - low)) * 100);
  }

  const k = sma(raw, smooth);
  const d = sma(raw, smooth + 1);
  if (k === null || d === null) return null;

  return { k, d };
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * MACD line (fast EMA - slow EMA), its signal EMA and the histogram. Both EMA
 * series are aligned on their tails before subtracting.
 */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  if (values.length < slow + signalPeriod) return null;

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  if (fastSeries.length === 0 || slowSeries.length === 0) return null;

  const length = Math.min(fastSeries.length, slowSeries.length);
  const macdLine: number[] = [];
  for (let i = 0; i < length; i++) {
    macdLine.push(fastSeries[fastSeries.length - length + i] - slowSeries[slowSeries.length - length + i]);
  }

  const signalSeries = emaSeries(macdLine, signalPeriod);
  if (signalSeries.length === 0) return null;

  const macdValue = macdLine[macdLine.length - 1];
  const signalValue = signalSeries[signalSeries.length - 1];

  return { macd: macdValue, signal: signalValue, histogram: macdValue - signalValue };
}

export interface AdxResult {
  adx: number;
  plusDi: number;
  minusDi: number;
}

/**
 * Wilder's Directional Movement system: ADX plus the +DI / -DI lines.
 * Uses Wilder smoothing throughout.
 */
export function adx(candles: Candle[], period = 14): AdxResult | null {
  if (candles.length < period * 2 + 1) return null;

  const trueRanges: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );

    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (trueRanges.length < period * 2) return null;

  let trSum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let plusSum = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let minusSum = minusDm.slice(0, period).reduce((a, b) => a + b, 0);

  const dxSeries: number[] = [];
  let plusDi = 0;
  let minusDi = 0;

  const computeDi = () => {
    plusDi = trSum === 0 ? 0 : (plusSum / trSum) * 100;
    minusDi = trSum === 0 ? 0 : (minusSum / trSum) * 100;
    const sum = plusDi + minusDi;
    dxSeries.push(sum === 0 ? 0 : (Math.abs(plusDi - minusDi) / sum) * 100);
  };

  computeDi();

  for (let i = period; i < trueRanges.length; i++) {
    trSum = trSum - trSum / period + trueRanges[i];
    plusSum = plusSum - plusSum / period + plusDm[i];
    minusSum = minusSum - minusSum / period + minusDm[i];
    computeDi();
  }

  if (dxSeries.length < period) return null;

  // First ADX is the average of the first `period` DX values, then Wilder-smoothed.
  let adxValue = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxSeries.length; i++) {
    adxValue = (adxValue * (period - 1) + dxSeries[i]) / period;
  }

  return { adx: adxValue, plusDi, minusDi };
}

/** Williams %R, range -100..0. */
export function williamsR(candles: Candle[], period = 14): number | null {
  const high = highest(candles, period);
  const low = lowest(candles, period);
  if (high === null || low === null) return null;
  if (high === low) return -50;
  const close = candles[candles.length - 1].close;
  return ((high - close) / (high - low)) * -100;
}

/** Commodity Channel Index over typical prices. */
export function cci(candles: Candle[], period = 14): number | null {
  if (candles.length < period) return null;

  const window = candles.slice(-period);
  const typical = window.map(c => (c.high + c.low + c.close) / 3);
  const mean = typical.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = typical.reduce((acc, v) => acc + Math.abs(v - mean), 0) / period;
  if (meanDeviation === 0) return 0;

  return (typical[typical.length - 1] - mean) / (0.015 * meanDeviation);
}

/** Wilder-smoothed Average True Range. */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previousClose = candles[i - 1].close;
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose)
      )
    );
  }

  if (trueRanges.length < period) return null;

  let value = trueRanges.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    value = (value * (period - 1) + trueRanges[i]) / period;
  }
  return value;
}

export interface UltimateOscillatorResult {
  value: number;
  previous: number;
}

/**
 * Ultimate Oscillator (Williams): a weighted blend of three buying-pressure
 * measures over 7, 14 and 28 periods. `previous` is the prior bar's value so
 * the caller can test for the classic divergence signal.
 */
export function ultimateOscillator(candles: Candle[]): UltimateOscillatorResult | null {
  const periods = [7, 14, 28];
  const maxPeriod = 28;
  if (candles.length < maxPeriod + 2) return null;

  const trueLow = (i: number) => Math.min(candles[i].low, candles[i - 1].close);
  const buyingPressure = (i: number) => candles[i].close - trueLow(i);
  const trueRange = (i: number) =>
    Math.max(candles[i].high, candles[i - 1].close) - trueLow(i);

  const computeAt = (endIndex: number): number | null => {
    let weighted = 0;
    let total = 0;
    for (const period of periods) {
      let bpSum = 0;
      let trSum = 0;
      for (let i = endIndex - period + 1; i <= endIndex; i++) {
        if (i < 1) return null;
        bpSum += buyingPressure(i);
        trSum += trueRange(i);
      }
      if (trSum === 0) return null;
      weighted += (bpSum / trSum) * period;
      total += period;
    }
    return total === 0 ? null : (weighted / total) * 100;
  };

  const value = computeAt(candles.length - 1);
  const previous = computeAt(candles.length - 2);
  if (value === null || previous === null) return null;

  return { value, previous };
}

/** Rate of change over `period` bars, as a percentage. */
export function roc(values: number[], period = 12): number | null {
  if (period <= 0 || values.length < period + 1) return null;
  const reference = values[values.length - 1 - period];
  if (!isFiniteNumber(reference) || reference === 0) return null;
  return ((values[values.length - 1] - reference) / reference) * 100;
}

export interface BullBearPowerResult {
  /** High - EMA(13): buyers' ability to push above the EMA. */
  bull: number;
  /** Low - EMA(13): sellers' ability to push below the EMA. */
  bear: number;
}

export function bullBearPower(candles: Candle[], period = 13): BullBearPowerResult | null {
  const last = candles[candles.length - 1];
  if (!last) return null;
  const emaValue = ema(closes(candles), period);
  if (emaValue === null) return null;
  return { bull: last.high - emaValue, bear: last.low - emaValue };
}

export interface HighsLowsResult {
  value: number;
  previous: number;
}

/**
 * Highs/Lows(14): the width of the recent range, and its previous value so a
 * rising range (expansion) can be told from a falling one (contraction).
 */
export function highsLows(candles: Candle[], period = 14): HighsLowsResult | null {
  if (candles.length < period + 1) return null;
  const currentWindow = candles.slice(-period);
  const previousWindow = candles.slice(-period - 1, -1);
  if (previousWindow.length < period) return null;

  const current = Math.max(...currentWindow.map(c => c.high)) - Math.min(...currentWindow.map(c => c.low));
  const previous = Math.max(...previousWindow.map(c => c.high)) - Math.min(...previousWindow.map(c => c.low));
  return { value: current, previous };
}

/** Percentage change from `reference` to `current`. */
export function percentChange(current: number, reference: number): number {
  if (!isFiniteNumber(reference) || reference === 0) return 0;
  return ((current - reference) / reference) * 100;
}
