// ============================================
// DESIGN TOKENS (JS mirror)
// ============================================
// The CSS variables in src/globals.css are the single source of truth for the
// theme. This module mirrors the few values that SVG attributes and inline
// styles need — SVG stroke/fill cannot read a CSS custom property as directly as
// a class can — so a re-skin touches globals.css and this file together, and
// nothing else.
//
// Keep these in sync with globals.css. They are deliberately the same hex
// values, not a second palette.

export const palette = {
  bgApp: '#0b0f14',
  bgSurface: '#11161d',
  bgElevated: '#161c25',
  bgInset: '#0d1218',
  borderHairline: '#232b36',
  borderStrong: '#313c4a',

  textPrimary: '#e6eaf0',
  textSecondary: '#9aa6b2',
  textMuted: '#5c6773',
  textFaint: '#3d4753',

  accent: '#5b8def',
  buy: '#2ebd85',
  sell: '#e5484d',
  neutral: '#8a94a6',
  warn: '#c8a45c',
} as const;

/** The arc gradient stops, muted, left (sell) to right (buy). */
export const gaugeArcStops = [
  { offset: '0%', color: '#b8444a' },
  { offset: '30%', color: '#8a5b62' },
  { offset: '50%', color: '#3a4453' },
  { offset: '70%', color: '#3f7d68' },
  { offset: '100%', color: '#2ebd85' },
] as const;

/** Motion durations, matching the CSS custom properties. */
export const motion = {
  fast: 150,
  base: 180,
  bar: 300,
} as const;
