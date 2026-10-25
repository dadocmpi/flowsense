// ============================================
// VOTE LOGIC
// ============================================
// Each indicator (and each moving average) casts one Buy / Neutral / Sell
// vote. The thresholds here are the standard ones used by public technical
// summaries. A reading outside the usable window casts NEUTRAL rather than
// guessing a direction.

import type { Candle, Vote, VoteDetail } from './types';
import {
  adx,
  atr,
  bullBearPower,
  cci,
  ema,
  highsLows,
  macd,
  percentChange,
  roc,
  rsi,
  sma,
  stochastic,
  stochasticRsi,
  ultimateOscillator,
  williamsR,
} from './indicators';
import type { CompassConfig } from '../config/compass';

function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

/**
 * Price against a moving average. Buy above, Sell below, Neutral inside the
 * configurable tolerance band (expressed as a percentage of the average, so
 * the same band works for gold at 2,600 and the S&P at 5,800).
 */
export function movingAverageVote(
  price: number,
  average: number,
  tolerancePercent: number
): Vote {
  if (!Number.isFinite(price) || !Number.isFinite(average) || average === 0) return 'NEUTRAL';
  const distance = percentChange(price, average);
  if (distance > tolerancePercent) return 'BUY';
  if (distance < -tolerancePercent) return 'SELL';
  return 'NEUTRAL';
}

/** All SMA / EMA lines for periods 5, 10, 20, 50, 100, 200. */
export function movingAverageVotes(candles: Candle[], config: CompassConfig): VoteDetail[] {
  if (candles.length === 0) return [];
  const values = candles.map(c => c.close);
  const price = values[values.length - 1];
  const details: VoteDetail[] = [];

  for (const period of [5, 10, 20, 50, 100, 200]) {
    for (const kind of ['SMA', 'EMA'] as const) {
      const value = kind === 'SMA' ? sma(values, period) : ema(values, period);
      if (value === null) continue;

      const distance = percentChange(price, value);
      details.push({
        name: `${kind} ${period}`,
        value,
        display: fmt(value, value >= 100 ? 2 : 4),
        vote: movingAverageVote(price, value, config.maTolerancePercent),
        note: `Price ${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%`,
      });
    }
  }

  return details;
}

function voteFromScore(score: number, buyThreshold: number, sellThreshold: number): Vote {
  if (score >= buyThreshold) return 'BUY';
  if (score <= sellThreshold) return 'SELL';
  return 'NEUTRAL';
}

/**
 * Every technical indicator required by the summary, each with its raw value
 * and a Buy / Sell / Neutral vote.
 */
export function indicatorVotes(candles: Candle[], config: CompassConfig): VoteDetail[] {
  const details: VoteDetail[] = [];
  if (candles.length === 0) return details;

  const values = candles.map(c => c.close);
  const price = values[values.length - 1];

  // RSI (14): >70 overbought -> Sell, <30 oversold -> Buy.
  const rsiValue = rsi(values, 14);
  if (rsiValue !== null) {
    details.push({
      name: 'RSI (14)',
      value: rsiValue,
      display: fmt(rsiValue, 1),
      vote: rsiValue >= 70 ? 'SELL' : rsiValue <= 30 ? 'BUY' : 'NEUTRAL',
      note: 'Overbought >70 / oversold <30',
    });
  }

  // Stochastic (9,6): %K vs %D.
  const stoch = stochastic(candles, 9, 6);
  if (stoch) {
    let vote: Vote = 'NEUTRAL';
    if (stoch.k < 20 && stoch.k > stoch.d) vote = 'BUY';
    else if (stoch.k > 80 && stoch.k < stoch.d) vote = 'SELL';
    else if (stoch.k < 20) vote = 'BUY';
    else if (stoch.k > 80) vote = 'SELL';
    details.push({
      name: 'Stochastic (9,6)',
      value: stoch.k,
      display: `${fmt(stoch.k, 1)} / ${fmt(stoch.d, 1)}`,
      vote,
      note: '%K / %D',
    });
  }

  // Stochastic RSI (14).
  const stochRsi = stochasticRsi(values, 14, 3);
  if (stochRsi) {
    let vote: Vote = 'NEUTRAL';
    if (stochRsi.k < 20 && stochRsi.k > stochRsi.d) vote = 'BUY';
    else if (stochRsi.k > 80 && stochRsi.k < stochRsi.d) vote = 'SELL';
    else if (stochRsi.k < 20) vote = 'BUY';
    else if (stochRsi.k > 80) vote = 'SELL';
    details.push({
      name: 'Stochastic RSI (14)',
      value: stochRsi.k,
      display: `${fmt(stochRsi.k, 1)} / ${fmt(stochRsi.d, 1)}`,
      vote,
      note: '%K / %D',
    });
  }

  // MACD (12,26,9): histogram sign, with the zero line as a secondary cue.
  const macdResult = macd(values, 12, 26, 9);
  if (macdResult) {
    const { histogram, macd: macdLine, signal } = macdResult;
    let vote: Vote = 'NEUTRAL';
    if (histogram > 0) vote = macdLine > 0 ? 'BUY' : 'BUY';
    else if (histogram < 0) vote = 'SELL';
    details.push({
      name: 'MACD (12,26,9)',
      value: histogram,
      display: fmt(histogram, Math.abs(histogram) >= 1 ? 3 : 5),
      vote,
      note: `MACD ${fmt(macdLine, 4)} vs signal ${fmt(signal, 4)}`,
    });
  }

  // ADX (14) with +DI / -DI: DI cross decides, a weak ADX mutes the reading.
  const adxResult = adx(candles, 14);
  if (adxResult) {
    const { adx: adxValue, plusDi, minusDi } = adxResult;
    let vote: Vote = 'NEUTRAL';
    if (adxValue >= 20) {
      if (plusDi > minusDi) vote = 'BUY';
      else if (minusDi > plusDi) vote = 'SELL';
    }
    details.push({
      name: 'ADX (14)',
      value: adxValue,
      display: fmt(adxValue, 1),
      vote,
      note: `+DI ${fmt(plusDi, 1)} / -DI ${fmt(minusDi, 1)}`,
    });
  }

  // Williams %R (14): -100..0.
  const williams = williamsR(candles, 14);
  if (williams !== null) {
    details.push({
      name: 'Williams %R (14)',
      value: williams,
      display: fmt(williams, 1),
      vote: williams <= -80 ? 'BUY' : williams >= -20 ? 'SELL' : 'NEUTRAL',
      note: 'Oversold <=-80 / overbought >=-20',
    });
  }

  // CCI (14).
  const cciValue = cci(candles, 14);
  if (cciValue !== null) {
    details.push({
      name: 'CCI (14)',
      value: cciValue,
      display: fmt(cciValue, 1),
      vote: voteFromScore(cciValue, 100, -100),
      note: 'Buy >100 / sell <-100',
    });
  }

  // ATR (14): a volatility context reading, never a direction on its own.
  const atrValue = atr(candles, 14);
  if (atrValue !== null) {
    const atrPercent = price > 0 ? (atrValue / price) * 100 : 0;
    details.push({
      name: 'ATR (14)',
      value: atrValue,
      display: fmt(atrValue, price >= 100 ? 2 : 4),
      vote: 'NEUTRAL',
      note: `${fmt(atrPercent, 2)}% of price`,
    });
  }

  // Highs/Lows (14): a rising range with price in the upper half is bullish.
  const hl = highsLows(candles, 14);
  if (hl) {
    const expanding = hl.value > hl.previous;
    const high = Math.max(...candles.slice(-14).map(c => c.high));
    const low = Math.min(...candles.slice(-14).map(c => c.low));
    const position = high === low ? 50 : ((price - low) / (high - low)) * 100;
    let vote: Vote = 'NEUTRAL';
    if (expanding) vote = position >= 50 ? 'BUY' : 'SELL';
    else vote = position >= 50 ? 'NEUTRAL' : 'NEUTRAL';
    details.push({
      name: 'Highs/Lows (14)',
      value: hl.value,
      display: fmt(hl.value, price >= 100 ? 2 : 4),
      vote,
      note: expanding ? 'Range expanding' : 'Range contracting',
    });
  }

  // Ultimate Oscillator: level plus the divergence between bars.
  const uo = ultimateOscillator(candles);
  if (uo) {
    let vote: Vote = 'NEUTRAL';
    if (uo.value < 30 && uo.value > uo.previous) vote = 'BUY';
    else if (uo.value > 70 && uo.value < uo.previous) vote = 'SELL';
    else if (uo.value > 70) vote = 'SELL';
    else if (uo.value < 30) vote = 'BUY';
    details.push({
      name: 'Ultimate Oscillator',
      value: uo.value,
      display: fmt(uo.value, 1),
      vote,
      note: 'Buy <30 / sell >70',
    });
  }

  // ROC (12).
  const rocValue = roc(values, 12);
  if (rocValue !== null) {
    details.push({
      name: 'ROC (12)',
      value: rocValue,
      display: `${rocValue >= 0 ? '+' : ''}${fmt(rocValue, 2)}%`,
      vote: rocValue > 0 ? 'BUY' : rocValue < 0 ? 'SELL' : 'NEUTRAL',
      note: 'Change over 12 bars',
    });
  }

  // Bull/Bear Power (13): net of the two lines decides.
  const bbp = bullBearPower(candles, 13);
  if (bbp) {
    const net = bbp.bull + bbp.bear;
    details.push({
      name: 'Bull/Bear Power (13)',
      value: net,
      display: fmt(net, price >= 100 ? 2 : 4),
      vote: net > 0 ? 'BUY' : net < 0 ? 'SELL' : 'NEUTRAL',
      note: `Bull ${fmt(bbp.bull, 2)} / Bear ${fmt(bbp.bear, 2)}`,
    });
  }

  return details;
}
