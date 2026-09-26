// ============================================
// TECHNICAL INDICATORS — PURE FUNCTIONS
// ============================================
// Computed from real OHLC candles. No randomness, no synthetic values.

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Base-asset volume initiated by buyers (Binance kline field 9). Populated by
  // the Binance client; it is a real aggressor split, not an estimate.
  takerBuyVolume?: number;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(-period);
  const sum = window.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length === 0) return [];

  const multiplier = 2 / (period + 1);
  const series: number[] = [];

  // Seed with the SMA of the first `period` values.
  let seed: number | null = null;
  if (values.length >= period) {
    seed = values.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
    series.push(seed);
  } else {
    // Not enough data to seed; use the first value as the seed.
    seed = values[0];
    series.push(seed);
  }

  for (let i = period; i < values.length; i++) {
    const previous = series[series.length - 1];
    series.push((values[i] - previous) * multiplier + previous);
  }

  return series;
}

export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  if (values.length < slow + signalPeriod) return null;

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  if (fastSeries.length === 0 || slowSeries.length === 0) return null;

  // Align both series to their last N points.
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

export function bollingerBands(
  values: number[],
  period = 20,
  stdDevMultiplier = 2
): { upper: number; middle: number; lower: number } | null {
  if (values.length < period) return null;

  const middle = sma(values, period);
  if (middle === null) return null;

  const window = values.slice(-period);
  const variance = window.reduce((acc, v) => acc + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDev * stdDevMultiplier,
    middle,
    lower: middle - stdDev * stdDevMultiplier,
  };
}

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

  // Wilder smoothing.
  let value = trueRanges.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    value = (value * (period - 1) + trueRanges[i]) / period;
  }
  return value;
}

export function vwap(candles: Candle[]): number | null {
  let priceVolume = 0;
  let volumeSum = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    priceVolume += typicalPrice * candle.volume;
    volumeSum += candle.volume;
  }

  return volumeSum > 0 ? priceVolume / volumeSum : null;
}

export interface VolumeProfileLevel {
  price: number;
  volume: number;
}

/**
 * Volume-at-price profile built from candles. Each candle distributes its
 * volume evenly across its high-low range. Returns levels sorted by price.
 */
export function volumeProfile(candles: Candle[], buckets = 40): VolumeProfileLevel[] {
  const tradable = candles.filter(c => isFiniteNumber(c.high) && isFiniteNumber(c.low) && c.high >= c.low);
  if (tradable.length === 0) return [];

  const highs = tradable.map(c => c.high);
  const lows = tradable.map(c => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min;
  if (range <= 0) return [];

  const bucketSize = range / buckets;
  const levels: VolumeProfileLevel[] = Array.from({ length: buckets }, (_, i) => ({
    price: min + bucketSize * (i + 0.5),
    volume: 0,
  }));

  for (const candle of tradable) {
    const candleRange = candle.high - candle.low;
    if (candleRange <= 0) {
      const index = Math.min(buckets - 1, Math.max(0, Math.floor((candle.close - min) / bucketSize)));
      levels[index].volume += candle.volume;
      continue;
    }

    const firstIndex = Math.min(buckets - 1, Math.max(0, Math.floor((candle.low - min) / bucketSize)));
    const lastIndex = Math.min(buckets - 1, Math.max(0, Math.floor((candle.high - min) / bucketSize)));
    const bucketsCovered = lastIndex - firstIndex + 1;
    const volumePerBucket = candle.volume / bucketsCovered;

    for (let i = firstIndex; i <= lastIndex; i++) {
      levels[i].volume += volumePerBucket;
    }
  }

  return levels;
}

export function pointOfControl(profile: VolumeProfileLevel[]): VolumeProfileLevel | null {
  if (profile.length === 0) return null;
  return profile.reduce((best, level) => (level.volume > best.volume ? level : best), profile[0]);
}

export function percentChange(current: number, reference: number): number {
  if (!isFiniteNumber(reference) || reference === 0) return 0;
  return ((current - reference) / reference) * 100;
}
