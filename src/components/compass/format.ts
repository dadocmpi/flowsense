// ============================================
// SHARED COMPASS UI HELPERS
// ============================================

import type { ScoreLabel, Vote } from '../../core/types';

/** Colour for a signed score, interpolated across the five label bands. */
export function scoreColor(score: number): string {
  if (score >= 60) return '#26a69a';
  if (score >= 20) return '#4db6ac';
  if (score <= -60) return '#ef5350';
  if (score <= -20) return '#e57373';
  return '#f59e0b';
}

const LABEL_TEXT: Record<ScoreLabel, string> = {
  STRONG_BUY: 'Strong buy',
  BUY: 'Buy',
  NEUTRAL: 'Neutral',
  SELL: 'Sell',
  STRONG_SELL: 'Strong sell',
};

export function labelText(label: ScoreLabel): string {
  return LABEL_TEXT[label];
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

export function labelBgColor(label: ScoreLabel): string {
  switch (label) {
    case 'STRONG_BUY':
      return 'bg-[#26a69a]/15 border-[#26a69a]/40';
    case 'BUY':
      return 'bg-[#4db6ac]/12 border-[#4db6ac]/35';
    case 'SELL':
      return 'bg-[#e57373]/12 border-[#e57373]/35';
    case 'STRONG_SELL':
      return 'bg-[#ef5350]/15 border-[#ef5350]/40';
    default:
      return 'bg-amber-500/10 border-amber-500/30';
  }
}

export function voteTextColor(vote: Vote): string {
  if (vote === 'BUY') return 'text-[#4db6ac]';
  if (vote === 'SELL') return 'text-[#e57373]';
  return 'text-amber-400';
}

export function voteWord(vote: Vote): string {
  if (vote === 'BUY') return 'Buy';
  if (vote === 'SELL') return 'Sell';
  return 'Neutral';
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

/** "42s ago", "2 min ago", "1h 5m ago" — how old a reading is. */
export function formatAge(updatedAt: number | null, now = Date.now()): string {
  if (!updatedAt) return '--';
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

/** A signed number with a leading + for positives, e.g. "+12.50". */
export function formatSigned(value: number, precision: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value, precision)}`;
}

/** A signed percentage, e.g. "+0.42%". */
export function formatSignedPercent(value: number, precision = 2): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(precision)}%`;
}
