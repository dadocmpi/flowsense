// ============================================
// REAL ORDER-FLOW STORE (client)
// ============================================
// One module-level store of the live venue feed, so the panel, the DOM ladder,
// the tape and the volume profile all read the SAME connection instead of each
// opening its own.
//
// PERFORMANCE. Every message is ingested immediately, but the UI is notified at
// most ~4 times a second: a burst of prints folds into the aggregator silently
// and one coalesced notification commits the new state to React. Raw prints live
// in a fixed-size ring, so a session that runs for days cannot grow the heap.
//
// Nothing here fabricates data. When the socket is down the health says why and
// the panels show "Feed unavailable" with the real last-update time.

import type { BookSnapshot, BookTicker, FeedHealth, TradePrint } from '../core/orderflow/types';
import { FlowAggregator } from '../core/orderflow/aggregate';
import { RingBuffer } from '../core/orderflow/ring';
import { probeBinanceFlow, subscribeOrderFlow, type OrderFlowSubscription } from '../core/providers/binanceFlow';

/** Prints kept for the tape, and for the volume profile of a short window. */
const TAPE_CAPACITY = 400;
/** UI commit cadence: ~4 updates a second. */
const COMMIT_INTERVAL_MS = 250;

export interface OrderFlowState {
  health: FeedHealth;
  book: BookSnapshot | null;
  ticker: BookTicker | null;
  prints: TradePrint[];
  aggregator: FlowAggregator;
  /** Epoch ms of the newest message of any kind. */
  lastMessageAt: number | null;
}

const aggregator = new FlowAggregator();
const prints = new RingBuffer<TradePrint>(TAPE_CAPACITY);
let book: BookSnapshot | null = null;
let ticker: BookTicker | null = null;
let health: FeedHealth | null = null;
let subscription: OrderFlowSubscription | null = null;
let started = false;
let version = 0;
let commitScheduled = false;
let lastCommitAt = 0;
let commitTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  lastCommitAt = Date.now();
  commitScheduled = false;
  for (const listener of listeners) listener();
}

/**
 * Schedule one coalesced notification. A burst of messages collapses into a
 * single commit, and never more often than COMMIT_INTERVAL_MS.
 */
function scheduleCommit(): void {
  if (commitScheduled) return;
  commitScheduled = true;
  const elapsed = Date.now() - lastCommitAt;
  const delay = elapsed >= COMMIT_INTERVAL_MS ? 0 : COMMIT_INTERVAL_MS - elapsed;
  commitTimer = setTimeout(notify, delay);
}

export function subscribeOrderFlowStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOrderFlowVersion(): number {
  return version;
}

/** The current live state. References change only when the feed writes. */
export function readOrderFlowState(): OrderFlowState {
  return {
    health:
      health ?? {
        status: 'CONNECTING',
        reason: null,
        lastMessageAt: null,
        lastBookAt: null,
        lastTradeAt: null,
        latencyMs: null,
        reconnectAttempt: 0,
        connectedSince: null,
        staleSince: null,
        messageCount: 0,
        venue: 'Binance USDT-M XAUUSDT PERP',
      },
    book,
    ticker,
    prints: prints.toArray(),
    aggregator,
    lastMessageAt: health?.lastMessageAt ?? null,
  };
}

/**
 * Start the feed once per page. Idempotent: several mounts cost one socket.
 */
export function ensureOrderFlowStarted(): void {
  if (started) return;
  started = true;

  void probeBinanceFlow().then(() => {
    subscription = subscribeOrderFlow({
      onMessage: (message, receivedAt) => {
        if (message.kind === 'DEPTH') {
          book = message.snapshot;
        } else if (message.kind === 'BOOK_TICKER') {
          ticker = message.ticker;
        } else if (message.kind === 'TRADE') {
          prints.push(message.print);
          aggregator.ingest(message.print);
        }
        void receivedAt;
        scheduleCommit();
      },
      onHealth: next => {
        health = next;
        scheduleCommit();
      },
    });
  });
}
