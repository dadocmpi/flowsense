// ============================================
// API CREDIT BUDGET
// ============================================
// Twelve Data's free plan allows 8 API credits per minute and 800 per day.
// Every upstream request costs 1 credit (batch calls cost 1 per symbol).
// This module keeps a local rolling budget so the app degrades gracefully
// instead of burning the daily allowance and getting 429s.

const MINUTE_CREDITS = 8;
const DAILY_CREDITS = 800;

const MINUTE_WINDOW_MS = 60_000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const MINUTE_STORAGE_KEY = 'flowsense:credits:minute';
const DAY_STORAGE_KEY = 'flowsense:credits:day';

interface WindowState {
  timestamps: number[];
}

function readWindow(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === 'number') : [];
  } catch {
    return [];
  }
}

function writeWindow(key: string, timestamps: number[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(timestamps));
  } catch {
    // Storage may be unavailable (private mode); the in-memory budget still applies.
  }
}

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter(t => now - t < windowMs);
}

export interface BudgetSnapshot {
  minuteUsed: number;
  minuteLimit: number;
  dayUsed: number;
  dayLimit: number;
  canSpend: boolean;
  retryInMs: number;
}

export function getBudgetSnapshot(now = Date.now()): BudgetSnapshot {
  const minute = prune(readWindow(MINUTE_STORAGE_KEY), MINUTE_WINDOW_MS, now);
  const day = prune(readWindow(DAY_STORAGE_KEY), DAY_WINDOW_MS, now);

  const minuteBlocked = minute.length >= MINUTE_CREDITS;
  const dayBlocked = day.length >= DAILY_CREDITS;

  let retryInMs = 0;
  if (minuteBlocked) {
    const oldest = Math.min(...minute);
    retryInMs = Math.max(0, MINUTE_WINDOW_MS - (now - oldest));
  } else if (dayBlocked) {
    const oldest = Math.min(...day);
    retryInMs = Math.max(0, DAY_WINDOW_MS - (now - oldest));
  }

  return {
    minuteUsed: minute.length,
    minuteLimit: MINUTE_CREDITS,
    dayUsed: day.length,
    dayLimit: DAILY_CREDITS,
    canSpend: !minuteBlocked && !dayBlocked,
    retryInMs,
  };
}

/**
 * Reserves one credit. Returns false when the budget is exhausted.
 * Callers must not issue a request when this returns false.
 */
export function trySpendCredit(now = Date.now()): boolean {
  const snapshot = getBudgetSnapshot(now);
  if (!snapshot.canSpend) return false;

  const minute = prune(readWindow(MINUTE_STORAGE_KEY), MINUTE_WINDOW_MS, now);
  const day = prune(readWindow(DAY_STORAGE_KEY), DAY_WINDOW_MS, now);

  minute.push(now);
  day.push(now);

  writeWindow(MINUTE_STORAGE_KEY, minute);
  writeWindow(DAY_STORAGE_KEY, day);
  return true;
}

export function resetBudget(): void {
  try {
    localStorage.removeItem(MINUTE_STORAGE_KEY);
    localStorage.removeItem(DAY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const BUDGET_LIMITS = { minute: MINUTE_CREDITS, day: DAILY_CREDITS };
