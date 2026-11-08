// ============================================
// ORDER FLOW HOOK
// ============================================
// Order flow is a SEPARATE provider from the candle feed: a candle carries no
// aggressor side and no book, so the venue's tape and quote are read on their
// own. That is why this hook does not depend on candles — the right-hand card
// can show real flow even when the candle provider has nothing for the
// instrument.
//
// It asks the server once whether a venue is configured (a server-side fact),
// then reads the venue for the selected (instrument, window) on a cadence tied
// to the tape. The venue is chosen PER ASSET by the server, so Gold and the
// index assets can use different sources; the probe reports which venue serves
// which asset so the card can pick the right capabilities.
//
// A venue that answers null, or cannot be reached, leaves the card in an
// unavailable state with the server's own note — never a fabricated reading. A
// venue whose market is closed keeps returning the LAST session's reading, which
// the card labels "Session closed" rather than "unavailable".

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Instrument } from '../core/instruments';
import type { Timeframe } from '../core/types';
import {
  activeOrderFlowProvider,
  orderFlowVenueForInstrument,
  probeOrderFlowProvider,
  type FlowWindow,
  type OrderFlowProbeResult,
  type OrderFlowReading,
} from '../core/providers/orderflow';
import { orderFlowCapabilitiesForVenue, type OrderFlowCapabilities } from '../core/providers/capabilities';
import {
  ORDER_FLOW_CLOSED_POLL_INTERVAL_MS,
  ORDER_FLOW_POLL_INTERVAL_MS,
} from '../core/providers/polling';

export type OrderFlowState = 'LOADING' | 'READY' | 'UNAVAILABLE';

export interface UseOrderFlowResult {
  /** Whether a venue is configured, and what it is. Null until the probe answers. */
  probe: OrderFlowProbeResult | null;
  /** The venue's real reading for the selected window, or null. */
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
  /** The venue serving the selected instrument, per the probe. */
  venue: string;
  /** LOADING while the probe or the venue call is in flight. */
  state: OrderFlowState;
  /** Epoch ms the current reading was fetched. */
  updatedAt: number | null;
  /** Round-trip time of the last venue read, ms. */
  latencyMs: number | null;
  /** True while a refresh is in flight over an existing reading. */
  refreshing: boolean;
}

export function useOrderFlow(
  instrument: Instrument,
  timeframe: Timeframe,
  window: FlowWindow = '5m'
): UseOrderFlowResult {
  const [probe, setProbe] = useState<OrderFlowProbeResult | null>(null);
  const [reading, setReading] = useState<OrderFlowReading | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [state, setState] = useState<OrderFlowState>('LOADING');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Refs the polling loop reads without re-arming on every reading it fetches:
  // the loop is keyed on (instrument, window), not on the reading.
  const hasReadingRef = useRef(false);
  const closedRef = useRef(false);

  useEffect(() => {
    hasReadingRef.current = reading !== null;
    closedRef.current = reading?.sessionClosed === true;
  }, [reading]);

  // Ask the server whether a venue exists, and which venue serves which asset.
  // Cached, so several callers share it.
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

  const venue = useMemo(() => orderFlowVenueForInstrument(instrument.id, probe), [instrument.id, probe]);
  const venueCapabilities = useMemo(() => orderFlowCapabilitiesForVenue(venue), [venue]);

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
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const read = async () => {
      controller = new AbortController();
      const startedAt = Date.now();
      if (hasReadingRef.current) setRefreshing(true);
      else setState('LOADING');

      try {
        const result = await provider.getReading({ instrument, timeframe, window, signal: controller.signal });
        if (!active) return;
        setLatencyMs(Date.now() - startedAt);
        setReading(result.reading);
        setNote(result.note);
        if (result.reading) {
          setUpdatedAt(Date.now());
          setState('READY');
        } else {
          setState('UNAVAILABLE');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!active) return;
        // A silent venue is reported as no reading, never as a guess.
        setReading(null);
        setNote('The order flow venue could not be read.');
        setState('UNAVAILABLE');
      } finally {
        if (active) setRefreshing(false);
      }

      if (!active) return;
      // A closed market's reading does not change, so back off; an open one is
      // refreshed on the tape cadence.
      timer = setTimeout(read, closedRef.current ? ORDER_FLOW_CLOSED_POLL_INTERVAL_MS : ORDER_FLOW_POLL_INTERVAL_MS);
    };

    read();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
    // The loop is deliberately keyed on (instrument, window, configured) only, so
    // it does not re-arm on every reading it fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, timeframe, window, probe?.configured]);

  // A toggle needs a reading to switch modes on. Without one the panel shows the
  // unavailable state, so no toggle is offered.
  const capabilities = useMemo(
    () => ({
      hasOrderBook: venueCapabilities.hasOrderBook && reading !== null,
      hasVolume: venueCapabilities.hasVolume,
      hasQuotes: venueCapabilities.hasQuotes && reading !== null,
    }),
    [venueCapabilities.hasOrderBook, venueCapabilities.hasVolume, venueCapabilities.hasQuotes, reading]
  );

  return { probe, reading, note, capabilities, venue, state, updatedAt, latencyMs, refreshing };
}
