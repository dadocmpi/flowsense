// ============================================
// RISK MATHS (client-side, manual inputs)
// ============================================
// Pure helpers for the Risk panel. Everything here is arithmetic over numbers
// the user types: no market data, no vendor, no network. This module is
// deliberately separate from the signal logic and is NEVER read by the Compass,
// the Summary or the Entry check.
//
// No trading firm's rules are encoded here. Limits are whatever the user enters;
// nothing is presented as an official figure.

export interface PositionSizeInput {
  /** Account balance in the quote currency. */
  balance: number;
  /** Fraction of balance to risk on the trade, as a percentage (e.g. 1 = 1%). */
  riskPercent: number;
  /** Stop distance in price points. */
  stopDistance: number;
  /** Units per 1.00 lot. XAUUSD is 100 oz per lot; editable, never assumed. */
  contractMultiplier: number;
  /** Value of one price point per unit (1 for most USD-quoted instruments). */
  pointValue?: number;
}

export interface PositionSizeResult {
  /** Currency amount at risk. */
  riskAmount: number;
  /** Units (ounces, shares) implied by the stop. */
  units: number;
  /** Lots, given the contract multiplier. */
  lots: number;
  /** True when the inputs are complete and positive. */
  valid: boolean;
  /** Why it is not valid, when it is not. */
  reason: string | null;
}

export function positionSize(input: PositionSizeInput): PositionSizeResult {
  const pointValue = input.pointValue ?? 1;
  const { balance, riskPercent, stopDistance, contractMultiplier } = input;

  if (!(balance > 0)) return { riskAmount: 0, units: 0, lots: 0, valid: false, reason: 'Enter an account balance' };
  if (!(riskPercent > 0)) return { riskAmount: 0, units: 0, lots: 0, valid: false, reason: 'Enter a risk percentage' };
  if (!(stopDistance > 0)) return { riskAmount: 0, units: 0, lots: 0, valid: false, reason: 'Enter a stop distance in points' };
  if (!(contractMultiplier > 0))
    return { riskAmount: 0, units: 0, lots: 0, valid: false, reason: 'Enter a contract multiplier' };

  const riskAmount = (balance * riskPercent) / 100;
  const riskPerUnit = stopDistance * pointValue;
  const units = riskAmount / riskPerUnit;
  const lots = units / contractMultiplier;

  return { riskAmount, units, lots, valid: true, reason: null };
}

export interface LossTrackerInput {
  balance: number;
  /** Daily loss limit as a percentage of balance. */
  dailyLossLimitPercent: number;
  /** Loss already taken today, in currency. */
  dailyLossTaken: number;
  /** Max drawdown limit as a percentage of the peak. */
  maxDrawdownPercent: number;
  /** The account's peak equity. */
  peakEquity: number;
  /** Current equity. */
  currentEquity: number;
}

export interface LossTrackerResult {
  /** Currency amount of the daily loss limit. */
  dailyLimitAmount: number;
  /** Currency still available before the daily limit. */
  dailyBuffer: number;
  /** Fraction of the daily limit used, 0..1+. */
  dailyUsedShare: number;
  /** Currency amount of the max-drawdown limit from the peak. */
  drawdownLimitAmount: number;
  /** Drawdown from the peak, in currency. */
  drawdownAmount: number;
  /** Fraction of the drawdown limit used, 0..1+. */
  drawdownUsedShare: number;
  /** Currency still available before the drawdown limit. */
  drawdownBuffer: number;
  /** True when the daily buffer is exhausted. */
  dailyBreached: boolean;
  /** True when the drawdown buffer is exhausted. */
  drawdownBreached: boolean;
  valid: boolean;
}

export function lossTracker(input: LossTrackerInput): LossTrackerResult {
  const { balance, dailyLossLimitPercent, dailyLossTaken, maxDrawdownPercent, peakEquity, currentEquity } = input;

  const dailyLimitAmount = (balance * Math.max(0, dailyLossLimitPercent)) / 100;
  const dailyBuffer = dailyLimitAmount - Math.max(0, dailyLossTaken);
  const drawdownLimitAmount = (peakEquity * Math.max(0, maxDrawdownPercent)) / 100;
  const drawdownAmount = Math.max(0, peakEquity - currentEquity);
  const drawdownBuffer = drawdownLimitAmount - drawdownAmount;

  return {
    dailyLimitAmount,
    dailyBuffer,
    dailyUsedShare: dailyLimitAmount > 0 ? Math.max(0, dailyLossTaken) / dailyLimitAmount : 0,
    drawdownLimitAmount,
    drawdownAmount,
    drawdownUsedShare: drawdownLimitAmount > 0 ? drawdownAmount / drawdownLimitAmount : 0,
    drawdownBuffer,
    dailyBreached: dailyLimitAmount > 0 && dailyBuffer <= 0,
    drawdownBreached: drawdownLimitAmount > 0 && drawdownBuffer <= 0,
    valid: balance > 0 && peakEquity > 0,
  };
}

// ============================================
// SESSION CLOCK
// ============================================

export type SessionName = 'Asia' | 'London' | 'New York';

export interface SessionWindow {
  name: SessionName;
  /** Open / close in minutes from UTC midnight. */
  openMinutes: number;
  closeMinutes: number;
}

/**
 * The three major FX/gold sessions, in UTC. Fixed windows on purpose: they are
 * the conventional cash-session hours, and expressing them in UTC keeps the
 * strip independent of the viewer's timezone.
 */
const SESSIONS: SessionWindow[] = [
  { name: 'Asia', openMinutes: 0, closeMinutes: 9 * 60 }, // 00:00-09:00 UTC (Tokyo)
  { name: 'London', openMinutes: 7 * 60, closeMinutes: 16 * 60 }, // 07:00-16:00 UTC
  { name: 'New York', openMinutes: 12 * 60, closeMinutes: 21 * 60 }, // 12:00-21:00 UTC
];

export interface SessionState extends SessionWindow {
  open: boolean;
  /** Fraction of the window elapsed, 0..1 (0 when closed). */
  progress: number;
}

/** Which sessions are open at `ms`, and how far through each one is. */
export function sessionStates(ms: number): SessionState[] {
  const d = new Date(ms);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const weekday = d.getUTCDay();
  // The conventional FX week runs Sunday 21:00 UTC to Friday 21:00 UTC; a simple
  // weekday guard is enough for a session strip.
  const weekend = weekday === 6 || (weekday === 5 && minutes >= 21 * 60) || (weekday === 0 && minutes < 21 * 60);

  return SESSIONS.map(session => {
    const open = !weekend && minutes >= session.openMinutes && minutes < session.closeMinutes;
    const progress = open ? (minutes - session.openMinutes) / (session.closeMinutes - session.openMinutes) : 0;
    return { ...session, open, progress };
  });
}
