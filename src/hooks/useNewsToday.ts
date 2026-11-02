// ============================================
// TODAY NEWS HOOK
// ============================================
// Fetches the "Today" panel's snapshot from this app's own news route. The key
// stays server-side; the route caches the vendor call for about five minutes, so
// this hook can re-fetch on a matching cadence and still cost almost nothing.
//
// When no source is configured the hook reports that and shows nothing — it never
// invents an event or a headline.

import { useEffect, useState } from 'react';
import {
  activeNewsProvider,
  probeNewsProvider,
  type EconomicEvent,
  type NewsHeadline,
  type NewsProbeResult,
} from '../core/providers/news';

/** Re-fetch a little under the server's five-minute cache. */
const CLIENT_REFRESH_MS = 4 * 60 * 1000;

export interface UseNewsTodayResult {
  probe: NewsProbeResult | null;
  events: EconomicEvent[];
  headlines: NewsHeadline[];
  fetchedAt: number | null;
  loading: boolean;
}

export function useNewsToday(): UseNewsTodayResult {
  const [probe, setProbe] = useState<NewsProbeResult | null>(null);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [headlines, setHeadlines] = useState<NewsHeadline[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const load = async () => {
      try {
        const result = await probeNewsProvider();
        if (!active) return;
        setProbe(result);
        if (!result.configured) {
          setEvents([]);
          setHeadlines([]);
          setFetchedAt(null);
          setLoading(false);
          return;
        }

        const snapshot = await activeNewsProvider().getSnapshot(controller.signal);
        if (!active) return;
        if (snapshot) {
          setEvents(snapshot.events);
          setHeadlines(snapshot.headlines);
          setFetchedAt(snapshot.fetchedAt);
        }
        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
      if (active) timer = setTimeout(load, CLIENT_REFRESH_MS);
    };

    void load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return { probe, events, headlines, fetchedAt, loading };
}
