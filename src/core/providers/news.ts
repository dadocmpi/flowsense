// ============================================
// NEWS / ECONOMIC CALENDAR PROVIDER
// ============================================
// The "Today" panel reads two things from a provider:
//
//   * today's economic calendar (time, country, event, impact, previous /
//     forecast / actual)
//   * the latest market headlines (title, source, time)
//
// The provider is selected server-side by NEWS_PROVIDER / NEWS_API_KEY, and the
// browser only ever calls this app's own route under api/, so the key never
// reaches the bundle. This module defines the interface and the shipped `none`
// adapter; the working adapter lives server-side in api/_lib/news.ts.
//
// NOTHING here is predicted or invented. A provider either returns real events
// and headlines or it returns none, and the panel then says "No data" or "No
// news source configured". The "affects" label is a RULE-BASED mapping from the
// event name to the assets it moves — it is a classification of the event, not a
// forecast of its outcome.

import type { ImpactLevel } from '../news/impact.js';

export type { ImpactLevel } from '../news/impact.js';

/** One economic-calendar entry. Null fields are genuinely unknown, not zero. */
export interface EconomicEvent {
  /** ISO 8601 timestamp of the release, in UTC. */
  time: string;
  /** ISO 3166 alpha-2 country code, or a central-bank code such as "EU". */
  country: string;
  /** The event's name as the provider gives it, e.g. "CPI (YoY)". */
  name: string;
  impact: ImpactLevel;
  previous: string | null;
  forecast: string | null;
  actual: string | null;
  /** Rule-based: which assets this event is known to move. */
  affects: string[];
}

/** One market headline. */
export interface NewsHeadline {
  title: string;
  source: string;
  /** ISO 8601 publication timestamp. */
  time: string;
  url: string | null;
}

export interface NewsSnapshot {
  /** Today's calendar, filtered to what moves USD, Gold and US indices. */
  events: EconomicEvent[];
  /** The latest headlines, newest first. */
  headlines: NewsHeadline[];
  /** Epoch ms this snapshot was fetched, for the data-age display. */
  fetchedAt: number;
}

export interface NewsProbeResult {
  configured: boolean;
  provider: string;
  label: string;
  note: string | null;
  reachable: boolean;
}

export interface NewsProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  /** A real snapshot, or null when there is nothing to show. */
  getSnapshot(signal?: AbortSignal): Promise<NewsSnapshot | null>;
}

/** The shipped adapter: no source configured, so nothing is shown. */
export const noneNewsProvider: NewsProvider = {
  id: 'none',
  label: 'None',
  isConfigured: () => false,
  getSnapshot: async () => null,
};

/** The adapter that talks to this app's own news route. */
export const httpNewsProvider: NewsProvider = {
  id: 'http',
  label: 'Server news',
  isConfigured: () => configuredNews,
  async getSnapshot(signal) {
    if (!configuredNews) return null;

    let response: Response;
    try {
      response = await fetch('/api/news/today', { signal, headers: { Accept: 'application/json' } });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return null;
    }

    let payload: {
      configured?: boolean;
      snapshot?: NewsSnapshot | null;
    } | null = null;
    try {
      payload = (await response.json()) as { configured?: boolean; snapshot?: NewsSnapshot | null };
    } catch {
      return null;
    }

    return payload?.snapshot ?? null;
  },
};

const adapters = new Map<string, NewsProvider>([
  [noneNewsProvider.id, noneNewsProvider],
  [httpNewsProvider.id, httpNewsProvider],
]);

let configuredNews = false;
let activeProviderId = 'none';

export function registerNewsProvider(provider: NewsProvider): void {
  adapters.set(provider.id, provider);
}

export function newsProviderFor(id: string): NewsProvider {
  return adapters.get(id) ?? noneNewsProvider;
}

export function activeNewsProvider(): NewsProvider {
  return newsProviderFor(activeProviderId);
}

let probeCache: NewsProbeResult | null = null;
let probeInFlight: Promise<NewsProbeResult> | null = null;

/**
 * Ask the server whether a news source is configured.
 *
 * A server-side fact, so it is asked once and cached; concurrent callers share
 * the one request. The route costs no vendor credits and no Twelve Data credit.
 */
export function probeNewsProvider(): Promise<NewsProbeResult> {
  if (probeCache) return Promise.resolve(probeCache);
  if (probeInFlight) return probeInFlight;

  probeInFlight = runNewsProbe()
    .then(result => {
      probeCache = result;
      activeProviderId = result.provider;
      configuredNews = result.configured;
      return result;
    })
    .finally(() => {
      probeInFlight = null;
    });

  return probeInFlight;
}

async function runNewsProbe(): Promise<NewsProbeResult> {
  try {
    const response = await fetch('/api/news/today', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return {
        configured: false,
        provider: 'none',
        label: 'None',
        note: `News route returned HTTP ${response.status}`,
        reachable: false,
      };
    }
    const payload = (await response.json()) as {
      configured?: boolean;
      provider?: string;
      label?: string;
      note?: string;
    };
    return {
      configured: payload.configured === true,
      provider: payload.configured === true ? payload.provider ?? 'http' : 'none',
      label: payload.label ?? 'None',
      note: payload.note ?? null,
      reachable: true,
    };
  } catch {
    return {
      configured: false,
      provider: 'none',
      label: 'None',
      note: 'Could not reach the news route',
      reachable: false,
    };
  }
}

/** Test seam: forget the cached probe. */
export function clearNewsCache(): void {
  probeCache = null;
  probeInFlight = null;
  activeProviderId = 'none';
  configuredNews = false;
}
