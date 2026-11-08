// ============================================
// FEED HEALTH STATE MACHINE (pure)
// ============================================
// The rules that decide whether the venue feed reads Live, Reconnecting or Down.
// Kept pure and separate from the socket so the robustness behaviour — the stale
// watchdog and the reconnect backoff — can be tested without a network.
//
// The one rule that matters: a feed with no message for longer than
// `staleAfterMs` is DOWN with the real age, never left reading Live.

import type { FeedHealth, ParsedFlowMessage } from './types';

/** A message older than this makes the feed Down, not Live. */
const STALE_AFTER_MS = 5_000;

/** Exponential backoff with a cap. `attempt` is 1-based. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];

export function backoffDelay(attempt: number): number {
  const index = Math.max(0, Math.min(attempt - 1, RECONNECT_DELAYS_MS.length - 1));
  return RECONNECT_DELAYS_MS[index];
}

/** Fold one parsed message into the health record. Returns a new object. */
export function applyMessage(
  health: FeedHealth,
  message: ParsedFlowMessage,
  receivedAt: number
): FeedHealth {
  const next: FeedHealth = { ...health, lastMessageAt: receivedAt, staleSince: null };
  next.messageCount = health.messageCount + 1;

  if (message.kind === 'DEPTH') {
    next.lastBookAt = receivedAt;
    next.latencyMs = Math.max(0, receivedAt - message.snapshot.exchangeTime);
  } else if (message.kind === 'TRADE') {
    next.lastTradeAt = receivedAt;
    next.latencyMs = Math.max(0, receivedAt - message.print.time);
  } else if (message.kind === 'BOOK_TICKER') {
    next.latencyMs = Math.max(0, receivedAt - message.ticker.exchangeTime);
  } else {
    // An unreadable frame is not a message; do not let it clear a stale state.
    return health;
  }

  if (next.status !== 'LIVE') {
    next.status = 'LIVE';
    next.reason = null;
  }
  return next;
}

/** Mark the feed Down when the venue has gone silent past the threshold. */
export function markStale(health: FeedHealth, now: number, staleAfterMs = STALE_AFTER_MS): FeedHealth {
  if (health.status !== 'LIVE') return health;
  if (health.lastMessageAt === null) return health;
  const age = now - health.lastMessageAt;
  if (age <= staleAfterMs) return health;
  return {
    ...health,
    status: 'DOWN',
    staleSince: health.lastMessageAt,
    reason: `No message for ${Math.round(age / 1000)}s`,
  };
}

/** Move to Reconnecting after a close, recording the attempt count. */
export function markReconnecting(health: FeedHealth, attempt: number): FeedHealth {
  return { ...health, status: 'RECONNECTING', reconnectAttempt: attempt };
}

/** Move to Down after too many failed attempts, with the honest reason. */
export function markDown(health: FeedHealth, reason: string): FeedHealth {
  return { ...health, status: 'DOWN', reason };
}
