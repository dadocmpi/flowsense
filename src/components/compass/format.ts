// ============================================
// SHARED FORMATTING HELPERS
// ============================================

import type { ScoreLabel, Vote } from '../../core/types';
import { PALETTE } from '../common/palette';

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

export function labelColor(label: ScoreLabel): string {
  switch (label) {
    case 'STRONG_BUY':
      return PALETTE.pos;
    case 'BUY':
      return PALETTE.posMuted;
    case 'SELL':
      return PALETTE.negMuted;
    case 'STRONG_SELL':
      return PALETTE.neg;
    default:
      return PALETTE.warn;
  }
}

export function voteColor(vote: Vote): string {
  if (vote === 'BUY') return PALETTE.pos;
  if (vote === 'SELL') return PALETTE.neg;
  return PALETTE.inkMuted;
}

export function voteWord(vote: Vote): string {
  if (vote === 'BUY') return 'Buy';
  if (vote === 'SELL') return 'Sell';
  return 'Neutral';
}

export function formatNumber(value: number, precision: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/** HH:MM:SS UTC. The clock is always UTC so a reviewer reads one clock. */
export function formatClockUtc(ms: number | null): string {
  if (!ms) return '--';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/** "42s ago", "2m ago", "1h 05m ago" — how old a reading is. */
export function formatAge(updatedAt: number | null, now = Date.now()): string {
  if (!updatedAt) return '--';
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export function formatSigned(value: number, precision: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value, precision)}`;
}

export function formatSignedPercent(value: number, precision = 2): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(precision)}%`;
}
