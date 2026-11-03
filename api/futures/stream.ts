// ============================================
// GET (upgrade) /api/futures/stream?symbol=...
// ============================================
// A browser-safe WebSocket relay for the live price of ONE symbol.
//
// The vendor's price socket needs an API key, and a key must never reach the
// browser. So the browser opens a socket to THIS endpoint, which opens the
// vendor socket server-side and forwards each price frame. The key stays in the
// environment and never appears in a URL the browser can see.
//
// This endpoint relays a PRICE only. It does not relay the order book and it
// does not invent an aggressor side: the client infers a side from the price
// direction with the tick rule, and labels that inference as such.
//
// When no key is configured the relay sends one status frame saying so and
// closes, so the client stops reconnecting instead of retrying a socket that can
// never succeed. The REST candle path is unaffected — it keeps working.
//
// The default export is the Node HTTP server Vercel attaches a WebSocket upgrade
// to; `attachRelay` is exported so the wiring can be tested without a socket.

import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { resolveVendor, vendorApiKey } from '../_lib/futuresShared.js';
import { relayPriceFrame, subscribeFrame, vendorSocketUrl } from '../_lib/priceRelay.js';

export interface RelaySocket {
  send: (data: string) => void;
  close: () => void;
  on: (event: 'open' | 'message' | 'close' | 'error', listener: (arg?: unknown) => void) => void;
}

export interface AttachRelayOptions {
  /** Resolve the vendor key, or null when none is configured. */
  getApiKey: () => string | null;
  /** Open the upstream socket. Injectable so the wiring can be tested. */
  createUpstream?: (url: string) => RelaySocket;
}

/**
 * Wire a `WebSocketServer` onto an HTTP server and relay each client's price
 * stream from the vendor.
 */
export function attachRelay(server: http.Server, options: AttachRelayOptions): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/api/futures/stream' });
  const createUpstream = options.createUpstream ?? (url => new WebSocket(url) as unknown as RelaySocket);

  wss.on('connection', (client: WebSocket, request: http.IncomingMessage) => {
    const apiKey = options.getApiKey();
    if (!apiKey) {
      // No key: say so once and close. This is the "not configured" path, not an
      // error the client should keep retrying.
      client.send(JSON.stringify({ event: 'subscribe-status', status: 'error', fails: [{ message: 'api key not configured' }] }));
      client.close();
      return;
    }

    const requested = new URL(request.url ?? '/', 'http://localhost').searchParams.get('symbol');
    const symbol = (requested ?? 'XAU/USD').trim();
    if (!symbol) {
      client.close();
      return;
    }

    let upstream: RelaySocket;
    try {
      upstream = createUpstream(vendorSocketUrl(apiKey));
    } catch {
      client.send(JSON.stringify({ event: 'subscribe-status', status: 'error', fails: [{ message: 'could not open vendor socket' }] }));
      client.close();
      return;
    }

    let closed = false;
    const shutdown = () => {
      if (closed) return;
      closed = true;
      try {
        upstream.close();
      } catch {
        // Already closed.
      }
      try {
        client.close();
      } catch {
        // Already closed.
      }
    };

    upstream.on('open', () => {
      upstream.send(subscribeFrame(symbol));
    });

    upstream.on('message', (data?: unknown) => {
      const text = typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf8') : null;
      if (text === null) return;
      const frame = relayPriceFrame(text);
      // Heartbeats and non-price frames are dropped rather than forwarded: the
      // client only parses price frames.
      if (frame === null) return;
      try {
        client.send(frame);
      } catch {
        shutdown();
      }
    });

    upstream.on('close', shutdown);
    upstream.on('error', shutdown);
    client.on('close', shutdown);
    client.on('error', shutdown);
  });

  return wss;
}

const server = http.createServer();
attachRelay(server, {
  getApiKey: () => (resolveVendor() ? vendorApiKey() : null),
});

export default server;
