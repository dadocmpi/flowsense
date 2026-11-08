// ============================================
// ORDER FLOW HOOK
// ============================================
// Order flow is a SEPARATE provider from the candle feed: a candle carries no
// aggressor side and no book, so the venue's tape and depth are read on their
// own. That is why this hook does not depend on candles — the right-hand card
// can show real flow even when the candle provider has nothing for the
// instrument.
//
// It asks the server once whether a venue is configured (a server-side fact),
// then reads that venue for the selected (instrument, timeframe). A venue that
// answers null, or cannot be reached, leaves the card in an unavailable state
// with the server's own note — never a fabricated reading.

import { useEffect, useMemo, useState } from 'react';
import type { Instrument } from '../core/instruments';
import type { Timeframe } from '../core/types';
import {
  activeOrderFlowProvider,
  probeOrderFlowProvider,
  type OrderFlowProbeResult,
  type OrderFlowReading,
} from '../core/providers/orderflow';
import { orderFlowCapabilitiesForVenue, type OrderFlowCapabilities } from '../core/providers/capabilities';

export type OrderFlowState = 'LOADING' | 'READY' | 'UNAVAILABLE';

export interface UseOrderFlowResult {
  /** Whether a venue is configured, and what it is. Null until the probe answers. */
  probe: OrderFlowProbeResult | null;
  /** The venue's real reading for the selected timeframe, or null. */
  reading: OrderFlowReading | null;
  /**
   * Why there is no reading, when there is none — the venue's own reason (e.g.
   * "No Binance market for ES."). Null while loading or when a reading exists.
   */
  note: string | null;
  /**
   * What the panel may offer FOR THIS INSTRUMENT. The venue's own capabilities
   * are AND-ed with "we actually have a reading", so the Book Flow toggle is
   * rendered only when the venue publishes a real book AND this instrument has a
   * live reading to switch modes on — never for a venue with no book, and never
   * for an instrument the venue has no market for.
   */
  capabilities: OrderFlowCapabilities;
  /** LOADING while the probe or the venue call is in flight. */
  state: OrderFlowState;
}

export function useOrderFlow(instrument: Instrument, timeframe: Timeframe): UseOrderFlowResult {
  const [probe, setProbe] = useState<OrderFlowProbeResult | null>(null);
  const [reading, setReading] = useState<OrderFlowReading | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [state, setState] = useState<OrderFlowState>('LOADING');

  // Ask the server whether a venue exists. Cached, so several callers share it.
  useEffect(() => {
    let active = true;
    probeOrderFlowProvider()
      .then(result => {
        if (active) setProbe(result);
      })
      .catch(() => {
        if (active) setProbe(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!probe?.configured) {
      setReading(null);
      setNote(probe ? probe.note : null);
      setState('UNAVAILABLE');
      return;
    }
    const provider = activeOrderFlowProvider();
    if (!provider.isConfigured()) {
      setReading(null);
      setNote(null);
      setState('UNAVAILABLE');
      return;
    }

    let active = true;
    const controller = new AbortController();
    setState('LOADING');
    provider
      .getReading({ instrument, timeframe, signal: controller.signal })
      .then(result => {
        if (!active) return;
        setReading(result.reading);
        setNote(result.note);
        setState(result.reading ? 'READY' : 'UNAVAILABLE');
      })
      .catch(() => {
        // A silent venue is reported as no reading, never as a guess.
        if (!active) return;
        setReading(null);
        setNote('The order flow venue could not be read.');
        setState('UNAVAILABLE');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [instrument, timeframe, probe?.configured]);

  const venueCapabilities = orderFlowCapabilitiesForVenue(probe?.venue);
  // A toggle needs a reading to switch modes on. Without one the panel shows the
  // unavailable state, so no toggle is offered.
  const capabilities = useMemo(
    () => ({
      hasOrderBook: venueCapabilities.hasOrderBook && reading !== null,
      hasVolume: venueCapabilities.hasVolume,
    }),
    [venueCapabilities.hasOrderBook, venueCapabilities.hasVolume, reading]
  );

  return { probe, reading, note, capabilities, state };
}
