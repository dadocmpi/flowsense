// ============================================
// PALETTE
// ============================================
// The single place the terminal's colours are named. Green/red carry direction
// only; amber is warning only; the accent is the one restrained highlight. A
// component picks a role here rather than hard-coding a hex.

export const PALETTE = {
  base0: '#0a0b0d',
  base1: '#101215',
  base2: '#16181c',
  base3: '#1d2025',
  line: '#23262c',
  ink: '#e7e9ee',
  inkMuted: '#9aa2ae',
  inkSubtle: '#697180',
  pos: '#3fb950',
  posMuted: '#2ea043',
  neg: '#f85149',
  negMuted: '#da3633',
  warn: '#d29922',
  accent: '#5b8def',
} as const;

/** Colour for a signed score, in the five label bands. */
export function scoreColor(score: number): string {
  if (score >= 60) return PALETTE.pos;
  if (score >= 20) return PALETTE.posMuted;
  if (score <= -60) return PALETTE.neg;
  if (score <= -20) return PALETTE.negMuted;
  return PALETTE.warn;
}
