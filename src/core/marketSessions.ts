// ============================================
// MARKET SESSIONS PER PROVIDER
// ============================================
// The two providers trade on different calendars, and the app must not confuse
// the two.
//
//   Twelve Data (Gold, XAU/USD) is a spot metal quote that keeps printing over
//   most of the clock, so the candle-staleness heuristic in marketHours.ts is the
//   right test for it.
//
//   Alpaca serves US equities (the SPY/DIA/QQQ proxies), which trade only in the
//   regular session — 09:30-16:00 ET, weekdays, minus the NYSE holidays. Outside
//   that window the newest Alpaca candle legitimately stays at the last close.
//   That is NORMAL, not a fault: it must be labelled "Market closed" and shown
//   with its real last-candle age, never as "Stale" or an error.
//
// This module is pure (no clock, no I/O): the caller injects `now`, and the
// session clock is resolved through Intl so daylight saving is handled by the
// platform rather than a hand-rolled offset table.

import type { Candle, Timeframe } from './types';
import { TIMEFRAME_MINUTES } from './types';
import { parseCandleTime } from './candles';
import { marketState, CLOSED_AFTER_BARS, type MarketStateResult } from './marketHours';
import { zonedParts, zonedTimeToUtc } from './session';

export type { MarketStateResult, MarketState } from './marketHours';

export const US_EQUITY_TIMEZONE = 'America/New_York';
/** Regular session open / close, minutes from midnight ET. */
export const US_EQUITY_OPEN_MINUTES = 9 * 60 + 30;
export const US_EQUITY_CLOSE_MINUTES = 16 * 60;

/** The provider whose calendar applies. */
export type MarketProvider = 'twelvedata' | 'alpaca';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The Nth given weekday (0=Sun..6=Sat) of a month, as a day-of-month number. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** The last given weekday of a month, as a day-of-month number. */
function lastWeekday(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  const lastDay = last.getUTCDate();
  const lastWeekdayIndex = last.getUTCDay();
  const offset = (lastWeekdayIndex - weekday + 7) % 7;
  return lastDay - offset;
}

/** The calendar day-of-month the market observes a fixed-date holiday on. */
function observedFixed(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  // Saturday -> observed the Friday before; Sunday -> the Monday after.
  if (weekday === 6) return dateKey(year, month, day - 1);
  if (weekday === 0) return dateKey(year, month, day + 1);
  return dateKey(year, month, day);
}

/** Easter Sunday (Gregorian) for a year, via the Meeus/Jones/Butcher algorithm. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const holidayCache = new Map<number, Set<string>>();

/**
 * The NYSE holiday calendar for a year, as "YYYY-MM-DD" keys in ET.
 *
 * A small, explicit list: the fixed-date holidays (with their observed day) and
 * the ones defined by rule (nth/last weekday, Good Friday). It is deliberately
 * a calendar rather than a guess — a US-equity session is either open by this
 * list or it is not.
 */
export function usEquityHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  // Good Friday is two days before Easter Sunday.
  const goodFriday = new Date(Date.UTC(year, easter.month - 1, easter.day) - 2 * 86_400_000);

  const dates = new Set<string>([
    observedFixed(year, 1, 1), // New Year's Day
    dateKey(year, 1, nthWeekday(year, 1, 1, 3)), // MLK Day (3rd Mon Jan)
    dateKey(year, 2, nthWeekday(year, 2, 1, 3)), // Washington's Birthday (3rd Mon Feb)
    dateKey(goodFriday.getUTCFullYear(), goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()),
    dateKey(year, 5, lastWeekday(year, 5, 1)), // Memorial Day (last Mon May)
    observedFixed(year, 6, 19), // Juneteenth
    observedFixed(year, 7, 4), // Independence Day
    dateKey(year, 9, nthWeekday(year, 9, 1, 1)), // Labor Day (1st Mon Sep)
    dateKey(year, 11, nthWeekday(year, 11, 4, 4)), // Thanksgiving (4th Thu Nov)
    observedFixed(year, 12, 25), // Christmas
  ]);

  holidayCache.set(year, dates);
  return dates;
}

/** Whether a calendar date (in ET) is an observed NYSE holiday. */
export function isUsEquityHoliday(year: number, month: number, day: number): boolean {
  return usEquityHolidays(year).has(dateKey(year, month, day));
}

/** The US-equity session state at an instant, in ET. */
export function usEquitySessionState(now: number = Date.now()): { open: boolean; reason: string } {
  const parts = zonedParts(now, US_EQUITY_TIMEZONE);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

  if (weekday === 0 || weekday === 6) {
    return { open: false, reason: 'US equities trade weekdays only — it is the weekend' };
  }
  if (isUsEquityHoliday(parts.year, parts.month, parts.day)) {
    return { open: false, reason: 'US equities are closed for a market holiday' };
  }

  const minutesOfDay = parts.hour * 60 + parts.minute;
  if (minutesOfDay < US_EQUITY_OPEN_MINUTES) {
    return { open: false, reason: 'US equities open at 09:30 ET' };
  }
  if (minutesOfDay >= US_EQUITY_CLOSE_MINUTES) {
    return { open: false, reason: 'US equities closed at 16:00 ET' };
  }
  return { open: true, reason: 'US equities are in the regular session' };
}

/**
 * The market state for a US-equity series.
 *
 * Within the session the newest bar must be current, so the same staleness test
 * as elsewhere applies. Outside the session the last close is expected, so the
 * state is CLOSED regardless of how old the bar is — with the real age reported
 * so the UI can show it honestly.
 */
export function usEquityMarketState(
  candles: Candle[],
  timeframe: Timeframe,
  now: number = Date.now(),
  closedAfterBars: number = CLOSED_AFTER_BARS
): MarketStateResult {
  const toleranceMs = TIMEFRAME_MINUTES[timeframe] * 60_000 * closedAfterBars;
  const session = usEquitySessionState(now);

  let lastMs: number | null = null;
  if (candles.length > 0) {
    const parsed = parseCandleTime(candles[candles.length - 1].datetime);
    lastMs = Number.isFinite(parsed) ? parsed : null;
  }
  const stalenessMs = lastMs === null ? null : Math.max(0, now - lastMs);

  if (!session.open) {
    return { state: 'CLOSED', stalenessMs, toleranceMs, reason: session.reason };
  }
  if (lastMs === null) {
    return { state: 'UNKNOWN', stalenessMs: null, toleranceMs, reason: 'No candles to judge from' };
  }
  // In-session: reuse the staleness test so a genuinely stopped feed is still
  // caught rather than excused by the calendar.
  return marketState(candles, timeframe, now, closedAfterBars);
}

/**
 * The market state for whichever provider serves an asset.
 *
 * Twelve Data (spot Gold) uses the candle-staleness heuristic; Alpaca (US
 * equities) uses the exchange calendar.
 */
export function marketStateFor(
  provider: MarketProvider,
  candles: Candle[],
  timeframe: Timeframe,
  now: number = Date.now(),
  closedAfterBars: number = CLOSED_AFTER_BARS
): MarketStateResult {
  if (provider === 'alpaca') return usEquityMarketState(candles, timeframe, now, closedAfterBars);
  return marketState(candles, timeframe, now, closedAfterBars);
}

/** Test seam: forget the cached holiday calendars. */
export function clearSessionCaches(): void {
  holidayCache.clear();
}

/** Re-exported so callers do not need the session module directly. */
export { zonedTimeToUtc };
