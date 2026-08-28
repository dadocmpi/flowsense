/**
 * Centralized number formatting utilities.
 * All numeric display in the application MUST go through these functions.
 * Never expose raw floating-point artifacts like 3.10932947522068.
 */

const XAUUSD_PRECISION = 2;
const FOREX_PRECISION = 5;
const DEFAULT_PRECISION = 2;

/** Get precision for a given symbol. */
export function getPrecision(symbol: string): number {
  if (symbol.includes('BTC') || symbol.includes('ETH')) return 2;
  if (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY')) return FOREX_PRECISION;
  if (symbol.includes('XAU') || symbol.includes('GOLD') || symbol.includes('OIL')) return XAUUSD_PRECISION;
  return DEFAULT_PRECISION;
}

/** Format price with appropriate precision. */
export function fmtPrice(value: number | undefined | null, precision?: number): string {
  if (value == null || isNaN(value)) return '--';
  const p = precision ?? DEFAULT_PRECISION;
  return value.toFixed(p);
}

/** Format price change with + sign. */
export function fmtChange(value: number | undefined | null, precision?: number): string {
  if (value == null || isNaN(value)) return '--';
  const p = precision ?? DEFAULT_PRECISION;
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(p)}`;
}

/** Format percentage. */
export function fmtPercent(value: number | undefined | null, precision = 2): string {
  if (value == null || isNaN(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(precision)}%`;
}

/** Format score 0-100 with optional label. */
export function fmtScore(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return `${Math.round(value)}`;
}

/** Format signed score -100 to +100. */
export function fmtSignedScore(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Math.round(value)}`;
}

/** Format volume with K/M/B suffixes. */
export function fmtVolume(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

/** Format delta with sign. */
export function fmtDelta(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}`;
}

/** Format distance in points/pips with context. */
export function fmtDistance(value: number | undefined | null, precision = 2): string {
  if (value == null || isNaN(value)) return '--';
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${abs.toFixed(precision)} pts`;
}

/** Format data quality percentage. */
export function fmtDataQuality(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return 'N/A';
  const pct = Math.round(value * 100);
  if (pct >= 90) return `${pct}% - EXCELLENT`;
  if (pct >= 70) return `${pct}% - GOOD`;
  if (pct >= 50) return `${pct}% - DEGRADED`;
  if (pct >= 30) return `${pct}% - LOW`;
  return `${pct}% - CRITICAL`;
}

/** Format time from timestamp. */
export function fmtTime(timestamp: number | undefined | null): string {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  return d.toTimeString().split(' ')[0];
}