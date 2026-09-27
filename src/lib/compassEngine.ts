// ============================================
// COMPASS ENGINE — PURE FUNCTIONS
// ============================================

import {
  CompassEngineConfig,
  DEFAULT_COMPASS_CONFIG,
  FactorContribution,
  LiveAnalysisState,
  OfficialCompassState,
  SignalHistoryEntry,
  CompassDirection,
  DataLabel,
} from '../types/compassEngine';

export { DEFAULT_COMPASS_CONFIG };
export type {
  CompassDirection,
  DataLabel,
  FactorContribution,
  LiveAnalysisState,
  OfficialCompassState,
  CompassEngineConfig,
  SignalHistoryEntry,
};

export function minuteKeyFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function scoreToDirection(score: number, config: CompassEngineConfig = DEFAULT_COMPASS_CONFIG): CompassDirection {
  if (score >= config.strongBuyScore) return 'STRONG_BUY';
  if (score >= config.buyScore) return 'BUY';
  if (score <= config.strongSellScore) return 'STRONG_SELL';
  if (score <= config.sellScore) return 'SELL';
  return 'NEUTRAL';
}

/** Clamp any raw reading onto the compass' 0-100 scale. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, score));
}

/**
 * The single geometric mapping for the gauge: a 0-100 score becomes the
 * needle's rotation in degrees, where 0 is the far-left (strong sell) end,
 * 50 is straight up (neutral) and 100 is the far-right (strong buy) end.
 * Every consumer of the needle MUST use this so position can never disagree
 * with the score it was derived from.
 */
export function needleAngleFromScore(score: number): number {
  return -90 + (clampScore(score) / 100) * 180;
}

/**
 * Confidence is derived from the same score that positions the needle, so the
 * badge can never contradict the gauge: a reading at neutral cannot claim high
 * confidence and a reading pinned to an extreme cannot claim low confidence.
 * Data quality scales the ceiling without changing the shape.
 */
export function confidenceFromScore(score: number, dataQuality: number): number {
  const distanceFromNeutral = Math.abs(clampScore(score) - 50) / 50;
  const quality = Math.max(0, Math.min(100, Number.isFinite(dataQuality) ? dataQuality : 0)) / 100;
  return Math.round(quality * (0.35 + 0.65 * distanceFromNeutral) * 100);
}

export function computeLiveAnalysis(
  params: {
    factors: FactorContribution[];
    price: number;
    dataQuality: number;
    dataLabel: DataLabel;
    marketRegime: string;
    timestamp: number;
    minuteKey: string;
  },
  config: CompassEngineConfig = DEFAULT_COMPASS_CONFIG
): LiveAnalysisState {
  const { factors, price, dataQuality, dataLabel, marketRegime, timestamp, minuteKey } = params;

  let buyWeight = 0;
  let sellWeight = 0;
  let neutralWeight = 0;
  let unavailableWeight = 0;

  factors.forEach(f => {
    switch (f.direction) {
      case 'BULLISH': buyWeight += f.weight; break;
      case 'BEARISH': sellWeight += f.weight; break;
      case 'NEUTRAL': neutralWeight += f.weight; break;
      case 'UNAVAILABLE': unavailableWeight += f.weight; break;
    }
  });

  const totalWeight = buyWeight + sellWeight + neutralWeight + unavailableWeight || 1;
  const rawScore = Math.round(((buyWeight - sellWeight) / totalWeight) * 100 + 50);
  const rawDirection = scoreToDirection(rawScore, config);

  const availableFactors = factors.filter(f => f.direction !== 'UNAVAILABLE').length;

  // Agreement measures how much the factors that took a side actually agree,
  // weighted by their contribution. It is NOT the share of factors that
  // reported data — a set of factors that all disagree must not read as 100%.
  const directionalWeight = buyWeight + sellWeight;
  const factorAgreement = directionalWeight > 0
    ? Math.min(100, Math.round((Math.max(buyWeight, sellWeight) / directionalWeight) * 100))
    : 0;

  const isStale = Date.now() - timestamp > config.maxDataAgeMs;

  return {
    minuteKey,
    rawScore,
    rawDirection,
    factorAgreement,
    totalFactors: factors.length,
    availableFactors,
    marketRegime,
    dataQuality,
    dataLabel,
    factors,
    timestamp,
    price,
    isStale,
  };
}

export function publishOfficialSignal(
  live: LiveAnalysisState,
  previousOfficial: OfficialCompassState | null,
  config: CompassEngineConfig = DEFAULT_COMPASS_CONFIG
): OfficialCompassState | null {
  if (!live.minuteKey) return null;

  // If we already published for this minute, don't republish
  if (previousOfficial && previousOfficial.minuteKey === live.minuteKey) {
    return null;
  }

  // Anti-noise rule: require meaningful score difference or minimum factor agreement
  const hasEnoughFactors = live.availableFactors >= config.minValidFactors;
  const hasMinConfidence = live.dataQuality >= config.minConfidence;
  const hasMinAgreement = live.factorAgreement >= config.minFactorAgreement;

  if (!hasEnoughFactors || !hasMinConfidence || !hasMinAgreement) {
    // If we have a previous official, keep it but mark stale
    if (previousOfficial) {
      return {
        ...previousOfficial,
        isStale: true,
        reason: 'Insufficient valid factors — previous signal retained',
      };
    }
    return null;
  }

  // The published direction is always derived from the published score. The
  // anti-noise threshold used to retain the previous direction while letting
  // the score move on, which let the gauge and its label drift apart; the
  // display now derives every element from this one score, so they cannot.
  const direction = scoreToDirection(live.rawScore, config);
  let reason = 'New minute snapshot — standard recalculation';

  if (previousOfficial && direction !== previousOfficial.direction) {
    const scoreDiff = Math.abs(live.rawScore - previousOfficial.score);
    reason = `Score change ${scoreDiff.toFixed(0)} pts — direction changed from ${previousOfficial.direction} to ${direction}`;
  }

  const factorSummary = live.factors
    .filter(f => f.direction !== 'UNAVAILABLE')
    .slice(0, 5)
    .map(f => `${f.name}: ${f.direction} (${f.weight}%)`);

  return {
    minuteKey: live.minuteKey,
    direction,
    score: live.rawScore,
    // Confidence is derived from the published score, never from the raw
    // factor agreement alone: whatever positions the needle also sets the
    // confidence, so the label and the gauge can never disagree.
    confidence: confidenceFromScore(live.rawScore, live.dataQuality),
    factorSummary,
    timestamp: live.timestamp,
    price: live.price,
    marketRegime: live.marketRegime,
    dataQuality: live.dataQuality,
    dataLabel: live.dataLabel,
    reason,
    isStale: live.isStale,
  };
}

export function addToHistory(
  history: SignalHistoryEntry[],
  signal: OfficialCompassState,
  maxEntries: number = 100
): SignalHistoryEntry[] {
  const entry: SignalHistoryEntry = {
    minuteKey: signal.minuteKey,
    direction: signal.direction,
    score: signal.score,
    confidence: signal.confidence,
    price: signal.price,
    marketRegime: signal.marketRegime,
    dataQuality: signal.dataQuality,
    dataLabel: signal.dataLabel,
    timestamp: signal.timestamp,
    factorSummary: signal.factorSummary,
  };

  // Don't duplicate the same minute
  if (history.length > 0 && history[history.length - 1].minuteKey === entry.minuteKey) {
    return history;
  }

  const updated = [...history, entry];
  return updated.slice(-maxEntries);
}

export function getNextMinuteBoundary(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
}

export function secondsUntilNextMinute(): number {
  const now = new Date();
  const next = getNextMinuteBoundary();
  return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

export function formatCompassDirection(d: CompassDirection): string {
  return d.replace('_', ' ');
}

/**
 * The compass scale is one continuous 0-100 range. These anchor colours sit on
 * that range at the five direction centres; every needle, tick and label colour
 * is interpolated from THIS list, so the colour the needle points into and the
 * colour of the label are always the same function of the same score.
 */
const SENTIMENT_ANCHORS: { score: number; color: string }[] = [
  { score: 0, color: '#ef5350' },   // strong sell
  { score: 25, color: '#e57373' },  // sell
  { score: 50, color: '#f59e0b' },  // neutral
  { score: 75, color: '#4db6ac' },  // buy
  { score: 100, color: '#26a69a' }, // strong buy
];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Colour of the scale at a given score, interpolated between the anchors. */
export function sentimentColorFromScore(score: number): string {
  const s = clampScore(score);
  for (let i = 0; i < SENTIMENT_ANCHORS.length - 1; i += 1) {
    const from = SENTIMENT_ANCHORS[i];
    const to = SENTIMENT_ANCHORS[i + 1];
    if (s <= to.score) {
      const t = to.score === from.score ? 0 : (s - from.score) / (to.score - from.score);
      const [r1, g1, b1] = hexToRgb(from.color);
      const [r2, g2, b2] = hexToRgb(to.color);
      const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
      return `#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(b1 + (b2 - b1) * t)}`;
    }
  }
  return SENTIMENT_ANCHORS[SENTIMENT_ANCHORS.length - 1].color;
}

/** Direction colour, taken from the same scale the needle is drawn on. */
export function directionColor(d: CompassDirection): string {
  switch (d) {
    case 'STRONG_BUY': return sentimentColorFromScore(100);
    case 'BUY': return sentimentColorFromScore(75);
    case 'NEUTRAL': return sentimentColorFromScore(50);
    case 'SELL': return sentimentColorFromScore(25);
    case 'STRONG_SELL': return sentimentColorFromScore(0);
    default: return sentimentColorFromScore(50);
  }
}

export function dataLabelColor(label: DataLabel): string {
  switch (label) {
    case 'LIVE': return 'text-green-400';
    case 'DELAYED': return 'text-amber-400';
    case 'CACHED': return 'text-blue-400';
    case 'SIMULATED': return 'text-purple-400';
    case 'UNAVAILABLE': return 'text-red-500';
    default: return 'text-white';
  }
}