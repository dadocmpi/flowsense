// ============================================
// SESSION BOUNDARIES + PER-SESSION METRICS
// ============================================
// Futures trade nearly around the clock, so a VWAP or volume profile measured
// over "the last N candles" is meaningless — it drifts across the session
// boundary and mixes yesterday's flow with today's.
//
// These functions answer one question: given a candle's timestamp and a
// session definition, which session does it belong to, and when did that
// session start? Everything downstream (VWAP, session high/low, POC) is then
// computed from exactly the candles of the current session, so it resets at
// the open by construction.
//
// The session clock is expressed in an IANA timezone (America/New_York for
// CME products) and resolved through Intl, so daylight saving is handled by
// the platform rather than by a hand-rolled offset table.

import type { Candle } from './types';
import type { SessionConfig } from '../config/compass';
import { parseCandleTime } from './candles';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of an instant in the session timezone. */
export function zonedParts(ms: number, timezone: string): ZonedParts {
  const parts = partsFormatter(timezone).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  // Intl reports midnight as hour 24 in some engines; normalise it.
  const hour = get('hour') % 24;
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') };
}

/**
 * Offset in milliseconds between the given timezone and UTC at an instant.
 * Derived by comparing the zoned wall clock against the UTC wall clock, which
 * is exact to the minute and DST-safe.
 */
function zoneOffsetMs(ms: number, timezone: string): number {
  const parts = zonedParts(ms, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // Compare at minute resolution to ignore the seconds/millis of `ms`.
  const floored = Math.floor(ms / 60_000) * 60_000;
  return asUtc - floored;
}

/** Instant (ms) for a wall-clock time in the session timezone. */
export function zonedTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // One correction pass is enough: the offset changes only at DST edges, and a
  // 1-hour step never moves a boundary by more than one offset change.
  const offset = zoneOffsetMs(guess, timezone);
  return guess - offset;
}

/**
 * Start of the session containing `ms`, as a UTC instant.
 *
 * RTH:  the current calendar day's open (09:30 ET by default).
 * FULL: the futures day, which begins at the previous evening's open
 *       (18:00 ET by default), so a candle at 02:00 belongs to the session
 *       that started at 18:00 the day before.
 */
export function sessionStartMs(ms: number, config: SessionConfig): number {
  const { timezone } = config;
  const parts = zonedParts(ms, timezone);
  const minutesOfDay = parts.hour * 60 + parts.minute;

  if (config.mode === 'RTH') {
    const openMinutes = config.rthOpenMinutes;
    if (minutesOfDay >= openMinutes) {
      return zonedTimeToUtc(timezone, parts.year, parts.month, parts.day, Math.floor(openMinutes / 60), openMinutes % 60);
    }
    // Before the open: still the previous calendar day's session.
    const previous = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 86_400_000);
    return zonedTimeToUtc(
      timezone,
      previous.getUTCFullYear(),
      previous.getUTCMonth() + 1,
      previous.getUTCDate(),
      Math.floor(openMinutes / 60),
      openMinutes % 60
    );
  }

  // FULL session.
  const openMinutes = config.fullOpenMinutes;
  if (minutesOfDay >= openMinutes) {
    return zonedTimeToUtc(timezone, parts.year, parts.month, parts.day, Math.floor(openMinutes / 60), openMinutes % 60);
  }
  const previous = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 86_400_000);
  return zonedTimeToUtc(
    timezone,
    previous.getUTCFullYear(),
    previous.getUTCMonth() + 1,
    previous.getUTCDate(),
    Math.floor(openMinutes / 60),
    openMinutes % 60
  );
}

/** Candles belonging to the session that contains the newest candle. */
export function candlesInCurrentSession(candles: Candle[], config: SessionConfig): Candle[] {
  if (candles.length === 0) return [];

  const lastMs = parseCandleTime(candles[candles.length - 1].datetime);
  if (!Number.isFinite(lastMs)) return [];

  const start = sessionStartMs(lastMs, config);
  return candles.filter(candle => {
    const ms = parseCandleTime(candle.datetime);
    return Number.isFinite(ms) && ms >= start;
  });
}
