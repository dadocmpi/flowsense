// ============================================
// USE TICK STREAM — live prints with auto-reconnect
// ============================================
// Subscribes to the app's own browser-safe price relay
// (`/api/futures/stream?symbol=...`) and classifies each print with the tick
// rule as it arrives.
//
// The relay holds the vendor key, so no key is ever in the URL the browser
// opens. When the server has no stream (or the socket drops) the hook retries on
// a capped backoff and reports the state honestly — it never presents a stale
// feed as live, and it never fabricates a tick to fill a gap.
//
// The rolling window is kept in a ref and trimmed to `windowSize`, and a
// coalesced snapshot is committed to React state on an interval, so a burst of
// prints does not re-render the panel per tick.

import { useEffect, useRef, useState } from 'react';
import { isConfigurationFailure, isEntitlementFailure, parseWsMessage } from '../core/providers/twelvedataWs';
import {
  classifyTicks,
  computeFlowReading,
  EMPTY_FLOW_READING,
  TICK_WINDOW,
  type ClassifiedTick,
  type FlowReading,
  type FlowTick,
  type TickSide,
} from '../core/tickflow';

export type TickStreamStatus = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE' | 'UNAVAILABLE';

/** Capped reconnect backoff, in ms. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];
/** How often the accumulated window is committed to React state. */
const FLUSH_MS = 250;

export interface UseTickStreamOptions {
  /** The symbol to stream, e.g. "XAU/USD". */
  symbol: string;
  /** Rolling window length in prints. */
  windowSize?: number;
  /** False disables the subscription entirely (e.g. when the panel is off). */
  enabled?: boolean;
}

export interface UseTickStreamResult {
  /** The rolling-window reading, or the empty reading before any print. */
  reading: FlowReading;
  /** Epoch ms of the newest print, or null. */
  lastTickAt: number | null;
  /** Price of the newest print, or null. */
  lastPrice: number | null;
  status: TickStreamStatus;
  /** True once at least one print has arrived. */
  hasData: boolean;
}

/** Build the relay URL for a symbol, on the page's own host and scheme. */
export function tickStreamUrl(symbol: string, location: Location = window.location): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/futures/stream?symbol=${encodeURIComponent(symbol)}`;
}

export function useTickStream({
  symbol,
  windowSize = TICK_WINDOW,
  enabled = true,
}: UseTickStreamOptions): UseTickStreamResult {
  const [reading, setReading] = useState<FlowReading>(EMPTY_FLOW_READING);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<TickStreamStatus>('CONNECTING');
  const [hasData, setHasData] = useState(false);

  const bufferRef = useRef<ClassifiedTick[]>([]);
  const lastSideRef = useRef<TickSide>('BUY');
  const dirtyRef = useRef(false);
  const windowRef = useRef(windowSize);
  windowRef.current = windowSize;

  useEffect(() => {
    if (!enabled || !symbol) {
      setStatus('UNAVAILABLE');
      return;
    }

    let socket: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let giveUp = false;

    const connect = () => {
      if (closed || giveUp) return;
      setStatus(attempt === 0 ? 'CONNECTING' : 'RECONNECTING');

      try {
        socket = new WebSocket(tickStreamUrl(symbol));
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        attempt = 0;
        setStatus('LIVE');
      };

      socket.onmessage = event => {
        if (typeof event.data !== 'string') return;
        const parsed = parseWsMessage(event.data);

        // A status frame that says "no key" or "not entitled" is permanent: stop
        // reconnecting rather than hammering a relay that can never succeed.
        if (parsed.kind === 'STATUS' && !parsed.ok && (isEntitlementFailure(parsed.detail) || isConfigurationFailure(parsed.detail))) {
          giveUp = true;
          setStatus('UNAVAILABLE');
          socket?.close();
          return;
        }

        if (parsed.kind !== 'PRICE') return;

        const tick: FlowTick = { price: parsed.message.price, timestamp: parsed.message.timestamp };
        const { classified, lastSide } = classifyTicks([tick], lastSideRef.current);
        lastSideRef.current = lastSide;
        if (classified.length === 0) return;

        const buffer = bufferRef.current;
        buffer.push(...classified);
        // Trim to the window so the buffer cannot grow without bound.
        if (buffer.length > windowRef.current) {
          buffer.splice(0, buffer.length - windowRef.current);
        }
        dirtyRef.current = true;
      };

      socket.onerror = () => {
        // An error is followed by a close; reconnect is handled there.
      };

      socket.onclose = () => {
        socket = null;
        if (closed || giveUp) return;
        setStatus('RECONNECTING');
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (closed || giveUp) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    const flush = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const snapshot = bufferRef.current;
      if (snapshot.length === 0) return;
      setReading(computeFlowReading(snapshot, windowRef.current));
      const newest = snapshot[snapshot.length - 1];
      setLastTickAt(newest.timestamp);
      setLastPrice(newest.price);
      setHasData(true);
    }, FLUSH_MS);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(flush);
      socket?.close();
      socket = null;
    };
  }, [symbol, enabled]);

  return { reading, lastTickAt, lastPrice, status, hasData };
}
