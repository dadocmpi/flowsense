// ============================================
// PLAIN-ENGLISH LABELS
// ============================================
// The engine keeps its internal enum values (SCREAMING_SNAKE) so the signal
// logic stays explicit. The UI never shows them: every value that reaches the
// screen passes through a formatter here first.
//
// Nothing in this module invents a reading. An unknown value falls back to a
// humanised version of the raw token rather than a made-up label.

/** Turn any internal token into readable words: `ORDER_FLOW` -> "Order flow". */
export function humanizeToken(value: string): string {
  const words = value
    .toLowerCase()
    .split('_')
    .filter(Boolean);
  if (words.length === 0) return '';

  const [first, ...rest] = words;
  return [first, ...rest].join(' ');
}

function titleCaseToken(value: string): string {
  const words = humanizeToken(value).split(' ');
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export type Verdict = 'Bullish' | 'Bearish' | 'Neutral' | 'Unavailable';

/** Factor direction as a plain verdict. */
export function verdictLabel(direction: string): Verdict {
  switch (direction) {
    case 'BULLISH':
      return 'Bullish';
    case 'BEARISH':
      return 'Bearish';
    case 'NEUTRAL':
      return 'Neutral';
    default:
      return 'Unavailable';
  }
}

const FACTOR_NAMES: Record<string, string> = {
  MARKET_CONTEXT: 'Market Context',
  MTF_ALIGNMENT: 'Trend Alignment',
  TECHNICAL_SUMMARY: 'Technical Summary',
  VOLATILITY_REGIME: 'Volatility',
  HTF_TREND: 'Higher-Timeframe Trend',
  AGGRESSOR_DELTA: 'Buy/Sell Pressure',
  SR_ZONE_BIAS: 'Support/Resistance Zone',
  REVERSAL_SIGNAL: 'Reversal Signal',
};

/** Factor name as a plain-English label. */
export function factorNameLabel(name: string): string {
  return FACTOR_NAMES[name] ?? titleCaseToken(name);
}

const FACTOR_CATEGORIES: Record<string, string> = {
  ZONE_CLUSTER: 'Market Structure',
  STRUCTURE: 'Market Structure',
  OSCILLATOR: 'Momentum',
  VOLATILITY: 'Volatility',
  MACRO: 'Trend',
  ORDER_FLOW: 'Order Flow',
  SUPPORT_RESISTANCE: 'Support/Resistance',
  REVERSAL: 'Reversal',
};

/** Factor category as a plain-English label. */
export function factorCategoryLabel(category: string): string {
  return FACTOR_CATEGORIES[category] ?? titleCaseToken(category);
}

const MARKET_STATES: Record<string, string> = {
  WAITING: 'Waiting',
  APPROACHING_ZONE: 'Approaching a zone',
  ENTERING_ZONE: 'Entering a zone',
  IN_ZONE: 'In a zone',
  ANALYZING: 'Analyzing',
  CONFIRMATION: 'Awaiting confirmation',
  HIGH_CONFLUENCE: 'High confluence',
  INVALIDATED: 'Invalidated',
  EXITED_ZONE: 'Left the zone',
  ZONE_BROKEN: 'Zone broken',
  UNKNOWN: 'Unknown',
};

/** Market state machine value as a plain-English label. */
export function marketStateLabel(state: string): string {
  return MARKET_STATES[state] ?? titleCaseToken(state);
}

const REVERSAL_STATES: Record<string, string> = {
  AT_SUPPORT: 'At support',
  AT_RESISTANCE: 'At resistance',
  APPROACHING_SUPPORT: 'Approaching support',
  APPROACHING_RESISTANCE: 'Approaching resistance',
  REJECTION_DETECTED: 'Rejection detected',
  BREAKOUT_DETECTED: 'Breakout detected',
  BREAKDOWN_DETECTED: 'Breakdown detected',
  RETEST_PENDING: 'Retest pending',
  BULLISH_REVERSAL_WATCH: 'Bullish reversal watch',
  BEARISH_REVERSAL_WATCH: 'Bearish reversal watch',
  CONFIRMATION_PENDING: 'Confirmation pending',
  READY_FOR_REVIEW: 'Ready for review',
  INVALIDATED: 'Invalidated',
  NO_TRADE: 'No signal',
};

/** Reversal state value as a plain-English label. */
export function reversalStateLabel(state: string): string {
  return REVERSAL_STATES[state] ?? titleCaseToken(state);
}

const DATA_LABELS: Record<string, string> = {
  LIVE: 'Live',
  DELAYED: 'Delayed',
  CACHED: 'Cached',
  SIMULATED: 'Simulated',
  UNAVAILABLE: 'Unavailable',
};

/** Feed data label as a plain-English label. */
export function dataLabelText(label: string): string {
  return DATA_LABELS[label] ?? titleCaseToken(label);
}

const STREAM_STATUSES: Record<string, string> = {
  LIVE: 'Live',
  CONNECTING: 'Connecting',
  RECONNECTING: 'Reconnecting',
  OFFLINE: 'Offline',
};

/** Order-flow stream status as a plain-English label. */
export function streamStatusLabel(status: string): string {
  return STREAM_STATUSES[status] ?? titleCaseToken(status);
}

const SR_TYPES: Record<string, string> = {
  MAJOR: 'Major level',
  INTRADAY: 'Intraday level',
  SUPPLY_ZONE: 'Supply zone',
  DEMAND_ZONE: 'Demand zone',
  LIQUIDITY_POOL: 'Liquidity pool',
  PREV_SESSION_HIGH: 'Previous session high',
  PREV_SESSION_LOW: 'Previous session low',
  PREV_DAY_HIGH: 'Previous day high',
  PREV_DAY_LOW: 'Previous day low',
  WEEKLY_HIGH: 'Weekly high',
  WEEKLY_LOW: 'Weekly low',
  OPENING_RANGE_HIGH: 'Opening range high',
  OPENING_RANGE_LOW: 'Opening range low',
  SWING_HIGH: 'Swing high',
  SWING_LOW: 'Swing low',
  HIGH_VOLUME_AREA: 'High-volume area',
  FAIR_VALUE_GAP: 'Fair value gap',
};

/** Support/resistance level type as a plain-English label. */
export function srTypeLabel(type: string): string {
  return SR_TYPES[type] ?? titleCaseToken(type);
}

const DIRECTION_TOKENS: Record<string, string> = {
  STRONG_BUY: 'strong buy',
  STRONG_SELL: 'strong sell',
  BUY: 'buy',
  SELL: 'sell',
  NEUTRAL: 'neutral',
};

/**
 * Engine reasons are written for logs, not for the screen: they contain raw
 * direction tokens such as `BUY`. Swap those for plain words so the one-line
 * reason under the compass reads naturally.
 */
export function plainReason(reason: string): string {
  return reason.replace(/STRONG_BUY|STRONG_SELL|BUY|SELL|NEUTRAL/g, token => DIRECTION_TOKENS[token] ?? token);
}

/** Trading session as a plain-English label. */
export function sessionLabel(session: string): string {
  switch (session) {
    case 'ASIA':
      return 'Asia';
    case 'LONDON':
      return 'London';
    case 'NEW_YORK':
      return 'New York';
    case 'OVERLAP_LN':
      return 'London overlap';
    case 'OVERLAP_NY':
      return 'New York overlap';
    case 'CLOSED':
      return 'Closed';
    default:
      return titleCaseToken(session);
  }
}
