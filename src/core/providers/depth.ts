// ============================================
// DEPTH PROVIDER (order book)
// ============================================
// BOOK FLOW reads a real order book: resting bids and asks with a price and a
// size. A price feed has no book, so this is a separate seam — the app never
// reconstructs a book from prints, and it never invents one.
//
// This module defines the `DepthProvider` interface and ships exactly ONE
// adapter: `none`. With `none` the Book Flow panel shows "Sem feed de
// profundidade conectado" and draws no numbers, because a fabricated book would
// be a lie about resting liquidity.
//
// HOW TO ADD A REAL BOOK
// The browser never holds a vendor key, so a real adapter would talk to this
// app's own server route (which holds the key) and stream snapshots to the
// client. That is a server-side change; the interface below is all the client
// needs.

import type { FlowReading } from '../tickflow';

/** One resting order-book level: a price and the size resting there. */
export interface DepthLevel {
  price: number;
  size: number;
}

/** A book snapshot: bids and asks, each best-first (bids descending, asks ascending). */
export interface DepthSnapshot {
  bids: DepthLevel[];
  asks: DepthLevel[];
  /** Epoch ms the snapshot was taken. */
  timestamp: number;
}

export type DepthStatus = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE' | 'UNAVAILABLE';

export interface DepthHandlers {
  onSnapshot: (snapshot: DepthSnapshot) => void;
  onStatus?: (status: DepthStatus) => void;
}

export interface DepthSubscription {
  close: () => void;
}

export interface DepthProvider {
  readonly id: string;
  readonly label: string;
  /** True when the provider has everything it needs to stream a book. */
  isConfigured(): boolean;
  /** Open a book stream. Only called when `isConfigured()` is true. */
  subscribe(symbol: string, handlers: DepthHandlers): DepthSubscription;
}

/**
 * The shipped adapter: no book source, so no snapshot ever arrives.
 *
 * `isConfigured()` is false and `subscribe` throws, so the panel takes the
 * explicit "no feed" path rather than rendering a book-shaped placeholder.
 */
export const noneDepthProvider: DepthProvider = {
  id: 'none',
  label: 'Sem feed de profundidade conectado',
  isConfigured: () => false,
  subscribe() {
    throw new Error('No depth provider is configured');
  },
};

/**
 * The registered depth provider, if any. Defaults to `none`, which is the
 * shipped state. Registering a real one is a one-line change at the call site
 * (or here) and needs no UI change.
 */
let registeredDepthProvider: DepthProvider = noneDepthProvider;

export function getDepthProvider(): DepthProvider {
  return registeredDepthProvider;
}

export function registerDepthProvider(provider: DepthProvider): void {
  registeredDepthProvider = provider;
}

export function resetDepthProvider(): void {
  registeredDepthProvider = noneDepthProvider;
}
