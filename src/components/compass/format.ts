// ============================================
// SHARED COMPASS UI HELPERS
// ============================================

import type { ScoreLabel, Vote } from '../../core/types';
import { palette } from '../../theme/tokens';

/**
 * Colour for a signed score, interpolated across the five label bands. The
 * greens and reds are the desaturated buy/sell tokens; Neutral is a muted
 * graphite rather than a loud amber, so it never reads as a signal.
 */
export function scoreColor(score: number): string {
  if (score >= 60) return palette.buy;
  if (score >= 20) return palette.buy;
  if (score <= -60) return palette.sell;
  if (score <= -20) return palette.sell;
  return palette.neutral;
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
      return 'text-buy';
    case 'BUY':
      return 'text-buy';
    case 'SELL':
      return 'text-sell';
    case 'STRONG_SELL':
      return 'text-sell';
    default:
      return 'text-ink-secondary';
  }
}

export function labelBgColor(label: ScoreLabel): string {
  switch (label) {
    case 'STRONG_BUY':
      return 'bg-buy-soft border-buy-border';
    case 'BUY':
      return 'bg-buy-soft border-buy-border';
    case 'SELL':
      return 'bg-sell-soft border-sell-border';
    case 'STRONG_SELL':
      return 'bg-sell-soft border-sell-border';
    default:
      return 'bg-flat-soft border-hairline';
  }
}

export function voteTextColor(vote: Vote): string {
  if (vote === 'BUY') return 'text-buy';
  if (vote === 'SELL') return 'text-sell';
  return 'text-ink-muted';
}

/** The tone class for a score, from the same bands as scoreColor. */
export function scoreTextColor(score: number): string {
  if (score >= 20) return 'text-buy';
  if (score <= -20) return 'text-sell';
  return 'text-ink-secondary';
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

/** HH:MM in the viewer's local timezone. */
export function formatTime(ms: number | null): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

/** A ▲ / ▼ / — glyph for a signed value, so colour is never the only cue. */
export function changeGlyph(value: number | null): string {
  if (value === null) return '';
  if (value > 0) return '▲';
  if (value < 0) return '▼';
  return '—';
}

