// ============================================
// BINANCE USDT-M FLOW FEED (client)
// ============================================
// The real order-flow source: Binance USDT-M futures public market streams for
// one symbol (XAUUSDT by default). No authentication, no API key, no server
// proxy — the venue publishes these streams to any client.
//
//   <symbol>@trade           aggressive prints, carrying the `m` flag
//   <symbol>@depth20@100ms   partial book, top 20 levels, every 100 ms
//   <symbol>@bookTicker      best bid/ask with sizes
//
// ROBUSTNESS
//   * exponential backoff with a cap, plus jitter, on every close
//   * a forced reconnect before the venue's 24 h connection limit
//   * a stale watchdog: no message for STALE_AFTER_MS reports the feed as down
//     with the real last-message age, never as live
//   * a server-side reachability probe classifies a geo-block (HTTP 451) or a
//     refusal, so the UI can show the reason instead of a bare "down"
//
// Nothing here fabricates data. When the socket cannot connect, the health
// reports why and the panel shows "Feed unavailable".

import type { FeedHealth, ParsedFlowMessage } from '../orderflow/types';
import { parseFlowMessage } from '../orderflow/parse';
import {
  applyMessage,
  backoffDelay,
  markDown,
  markReconnecting,
  markStale,
} from '../orderflow/health';

/** The venue label the UI shows, verbatim and factual. */
const DEFAULT_VENUE = 'Binance USDT-M XAUUSDT PERP';
const DEFAULT_SYMBOL = 'XAUUSDT';
const DEFAULT_WS_HOST = 'wss://fstream.binance.com';

/** Reconnect before the venue's 24 h connection ceiling. */
const FORCED_RECONNECT_MS = 23 * 60 * 60 * 1_000;
const WATCHDOG_MS = 1_000;
const MAX_ATTEMPTS_BEFORE_REPROBE = 3;

export interface BinanceFlowConfig {
  /** False when the operator turned the flow feed off. */
  enabled: boolean;
  symbol: string;
  venue: string;
  wsHost: string;
  /** What the server's REST probe saw, for an honest failure reason. */
  restReachable: boolean;
  restStatus: number | null;
  restNote: string | null;
}

const DEFAULT_CONFIG: BinanceFlowConfig = {
  enabled: true,
  symbol: DEFAULT_SYMBOL,
  venue: DEFAULT_VENUE,
  wsHost: DEFAULT_WS_HOST,
  restReachable: false,
  restStatus: null,
  restNote: null,
};

let configCache: BinanceFlowConfig | null = null;
let configInFlight: Promise<BinanceFlowConfig> | null = null;

/** The last config the server reported, or the shipped defaults before then. */
function binanceFlowConfig(): BinanceFlowConfig {
  return configCache ?? DEFAULT_CONFIG;
}

/**
 * Ask the server for the flow config and a REST reachability probe.
 *
 * The probe exists because a browser WebSocket gives no HTTP status: a socket
 * that closes immediately is either a network fault or the venue refusing this
 * region, and only a REST call can tell them apart (HTTP 451 is a geo-block).
 */
export function probeBinanceFlow(): Promise<BinanceFlowConfig> {
  if (configCache) return Promise.resolve(configCache);
  if (configInFlight) return configInFlight;

  configInFlight = (async () => {
    try {
      const response = await fetch('/api/orderflow/binance-config', { headers: { Accept: 'application/json' } });
      const payload = (await response.json()) as Partial<BinanceFlowConfig> & { ok?: boolean };
      const config: BinanceFlowConfig = {
        enabled: payload.enabled !== false,
        symbol: payload.symbol ?? DEFAULT_SYMBOL,
        venue: payload.venue ?? DEFAULT_VENUE,
        wsHost: payload.wsHost ?? DEFAULT_WS_HOST,
        restReachable: payload.restReachable === true,
        restStatus: typeof payload.restStatus === 'number' ? payload.restStatus : null,
        restNote: payload.restNote ?? null,
      };
      configCache = config;
      return config;
    } catch {
      // The route itself is unreachable. Keep the shipped defaults and let the
      // socket try; a failure is then reported as a network fault.
      const config: BinanceFlowConfig = { ...DEFAULT_CONFIG, restNote: 'Could not reach the flow config route' };
      configCache = config;
      return config;
    } finally {
      configInFlight = null;
    }
  })();

  return configInFlight;
}

/** Test seam: forget the cached config. */
export function clearBinanceFlowConfig(): void {
  configCache = null;
  configInFlight = null;
}

export interface OrderFlowHandlers {
  onMessage: (message: ParsedFlowMessage, receivedAt: number) => void;
  onHealth: (health: FeedHealth) => void;
}

export interface OrderFlowSubscription {
  close: () => void;
}

/** The combined-stream URL for one symbol. */
function flowStreamUrl(config: BinanceFlowConfig): string {
  const symbol = config.symbol.toLowerCase();
  const streams = [`${symbol}@trade`, `${symbol}@depth20@100ms`, `${symbol}@bookTicker`];
  return `${config.wsHost}/stream?streams=${streams.join('/')}`;
}

/**
 * Open the flow feed and keep it open.
 *
 * Returns a handle whose `close()` tears the socket down and stops all timers.
 * Every message is handed to `onMessage` exactly as it arrived; the caller owns
 * aggregation and rendering.
 */
export function subscribeOrderFlow(handlers: OrderFlowHandlers): OrderFlowSubscription {
  const config = binanceFlowConfig();
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let forcedTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  const health: FeedHealth = {
    status: config.enabled ? 'CONNECTING' : 'DISABLED',
    reason: config.enabled ? null : 'Order-flow feed disabled by configuration',
    lastMessageAt: null,
    lastBookAt: null,
    lastTradeAt: null,
    latencyMs: null,
    reconnectAttempt: 0,
    connectedSince: null,
    staleSince: null,
    messageCount: 0,
    venue: config.venue,
  };

  const emit = () => handlers.onHealth({ ...health });

  const failReason = (): string => {
    if (config.restStatus === 451) return 'Venue geo-blocked this region (HTTP 451)';
    if (config.restStatus && config.restStatus >= 400) return `Venue REST probe returned HTTP ${config.restStatus}`;
    if (!config.restReachable && config.restNote) return config.restNote;
    if (!config.restReachable) return 'Venue REST probe unreachable from the server';
    return 'Socket closed before the venue sent data';
  };

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (forcedTimer) clearTimeout(forcedTimer);
    if (watchdogTimer) clearInterval(watchdogTimer);
    reconnectTimer = null;
    forcedTimer = null;
    watchdogTimer = null;
  };

  const connect = () => {
    if (closed) return;
    health.status = attempt === 0 ? 'CONNECTING' : 'RECONNECTING';
    health.reason = null;
    emit();

    let url: string;
    try {
      url = flowStreamUrl(config);
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      if (closed) return;
      attempt = 0;
      health.status = 'LIVE';
      health.reason = null;
      health.connectedSince = Date.now();
      health.reconnectAttempt = 0;
      health.staleSince = null;
      emit();

      // The venue closes any connection at 24 h; reconnect cleanly before that.
      forcedTimer = setTimeout(() => {
        if (!closed) socket?.close();
      }, FORCED_RECONNECT_MS);
    };

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;
      const receivedAt = Date.now();
      const parsed = parseFlowMessage(event.data, receivedAt);
      if (parsed.kind === 'UNKNOWN') return;

      const next = applyMessage(health, parsed, receivedAt);
      if (next === health) return; // an unreadable frame is not a message
      Object.assign(health, next);
      handlers.onMessage(parsed, receivedAt);
      emit();
    };

    socket.onerror = () => {
      // The close handler does the recovery; this only records that it happened.
      if (health.status === 'LIVE') health.reason = failReason();
    };

    socket.onclose = () => {
      socket = null;
      if (closed) return;
      if (forcedTimer) clearTimeout(forcedTimer);
      forcedTimer = null;
      health.status = 'RECONNECTING';
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    // Jitter so many tabs do not reconnect in lockstep.
    const jittered = backoffDelay(attempt + 1) + Math.floor(Math.random() * 250);
    attempt += 1;
    Object.assign(health, markReconnecting(health, attempt));
    if (attempt > MAX_ATTEMPTS_BEFORE_REPROBE) {
      // Repeated failure: report the honest reason from the last probe.
      Object.assign(health, markDown(health, failReason()));
    }
    emit();
    reconnectTimer = setTimeout(connect, jittered);
  };

  // Stale watchdog: a socket can stay open while the venue goes silent.
  watchdogTimer = setInterval(() => {
    if (closed) return;
    const next = markStale(health, Date.now());
    if (next !== health) {
      Object.assign(health, next);
      emit();
    }
  }, WATCHDOG_MS);

  if (!config.enabled) {
    emit();
  } else {
    connect();
  }

  return {
    close: () => {
      closed = true;
      clearTimers();
      socket?.close();
      socket = null;
    },
  };
}
