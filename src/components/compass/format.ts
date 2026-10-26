// ============================================
// SHARED COMPASS UI HELPERS
// ============================================

import type { ScoreLabel } from '../../core/types';

/** Colour for a signed score, interpolated across the five label bands. */
export function scoreColor(score: number): string {
  if (score >= 60) return '#26a69a';
  if (score >= 20) return '#4db6ac';
  if (score <= -60) return '#ef5350';
  if (score <= -20) return '#e57373';
  return '#f59e0b';
}

const LABEL_SHORT: Record<ScoreLabel, string> = {
  STRONG_BUY: 'Strong Buy',
  BUY: 'Buy',
  NEUTRAL: 'Neutral',
  SELL: 'Sell',
  STRONG_SELL: 'Strong Sell',
};

export function labelShort(label: ScoreLabel): string {
  return LABEL_SHORT[label];
}

export function labelTextColor(label: ScoreLabel): string {
  switch (label) {
    case 'STRONG_BUY':
      return 'text-[#26a69a]';
    case 'BUY':
      return 'text-[#4db6ac]';
    case 'SELL':
      return 'text-[#e57373]';
    case 'STRONG_SELL':
      return 'text-[#ef5350]';
    default:
      return 'text-amber-400';
  }
}

export function formatNumber(value: number, precision: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/** HH:MM:SS in the viewer's local timezone. */
export function formatClock(ms: number | null): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** A signed score, e.g. "+42" / "-17". */
export function formatScore(score: number): string {
  const rounded = Math.round(score);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
