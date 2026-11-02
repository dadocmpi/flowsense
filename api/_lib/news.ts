// ============================================
// NEWS / ECONOMIC CALENDAR ADAPTER (server-side)
// ============================================
// THE ONE FILE TO EDIT TO CONNECT A NEWS PROVIDER.
//
// The browser never holds a vendor key, so the "Today" panel reads news through
// this server module. The client already speaks the shape below (see
// src/core/providers/news.ts); connecting a vendor means implementing
// `fetchNewsSnapshot` here and setting two environment variables:
//
//   NEWS_PROVIDER=fmp        (or "finnhub"; anything else means "none")
//   NEWS_API_KEY=...         (read only here, never in the bundle)
//
// WHAT WAS TESTED, AND WHAT EACH CANDIDATE RETURNED
// ------------------------------------------------
// Candidates were probed with a keyless request first; both answer with an
// auth error, so the contract below is taken from the vendors' own docs:
//
//   * Financial Modeling Prep — `GET /stable/economic-calendar?from&to&apikey`
//     returns the economic calendar on the free plan (FMP's own FAQ: the free
//     plan carries the economic calendar; the time zone is UTC). Its
//     `/stable/news/general-latest` returns general headlines on the free plan.
//     Keyless result: {"Error Message":"Invalid API KEY..."}.
//   * Finnhub — `GET /news?category=general&token` returns general headlines on
//     the free plan. Its `GET /calendar/economic?token` is marked
//     "Premium: Premium Access Required" in Finnhub's own docs, so it is NOT
//     used for the calendar. Keyless result: {"error":"Please use an API key."}.
//
// So the working free-key combination is: FMP for the economic calendar, and
// either FMP or Finnhub for the headlines. `fmp` is the default because it
// covers both from one key. No key was available in the build environment, so
// the adapter is written to the documented contract and the `none` adapter
// remains the shipped default until a key is set.
//
// RESPONSE CACHING. The snapshot is cached in memory for NEWS_CACHE_TTL_MS
// (about five minutes), so the panel costs almost no quota. News calls never
// touch the Twelve Data credit meter: they are a different vendor entirely.

import type { EconomicEvent, NewsHeadline, NewsSnapshot } from '../../src/core/providers/news.js';
import { affectsFor, normalizeImpact } from '../../src/core/news/impact.js';

export type NewsVendor = 'none' | 'fmp' | 'finnhub';

/** How long a fetched snapshot is reused server-side (about five minutes). */
export const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

/** Headlines older than this are not shown: the panel is about "now". */
const HEADLINE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const HEADLINE_LIMIT = 8;

/** Which adapter this deployment is configured to use. */
export function resolveNewsVendor(): NewsVendor {
  const raw = (process.env.NEWS_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'fmp' || raw === 'financialmodelingprep') return 'fmp';
  if (raw === 'finnhub') return 'finnhub';
  return 'none';
}

/** The vendor key. Read only on the server; never returned to the client. */
export function newsApiKey(): string | null {
  const key = (process.env.NEWS_API_KEY ?? '').trim();
  return key.length > 0 ? key : null;
}

/** True when a source is configured AND has a key. */
export function newsConfigured(): boolean {
  return resolveNewsVendor() !== 'none' && newsApiKey() !== null;
}

/** A human label for the configured source, for the provenance line. */
export function newsLabel(): string {
  switch (resolveNewsVendor()) {
    case 'fmp':
      return 'Financial Modeling Prep';
    case 'finnhub':
      return 'Finnhub';
    default:
      return 'None';
  }
}

interface CacheEntry {
  snapshot: NewsSnapshot;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/** Test seam: forget the cached snapshot. */
export function clearNewsSnapshotCache(): void {
  cache = null;
}

/** Today's UTC date as YYYY-MM-DD. */
function isoDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * A snapshot, from the cache when it is fresh. Concurrent callers share one
 * in-flight fetch so a burst of page loads costs a single vendor call.
 */
let inFlight: Promise<NewsSnapshot | null> | null = null;

export async function fetchNewsSnapshot(now: number = Date.now()): Promise<NewsSnapshot | null> {
  if (!newsConfigured()) return null;

  if (cache && cache.expiresAt > now) return cache.snapshot;
  if (inFlight) return inFlight;

  inFlight = runFetch(now)
    .then(snapshot => {
      if (snapshot) cache = { snapshot, expiresAt: now + NEWS_CACHE_TTL_MS };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

async function runFetch(now: number): Promise<NewsSnapshot | null> {
  const vendor = resolveNewsVendor();
  const key = newsApiKey();
  if (!key || vendor === 'none') return null;

  const [events, headlines] = await Promise.all([
    vendor === 'fmp' ? fetchFmpCalendar(key, now) : Promise.resolve([]),
    vendor === 'fmp' ? fetchFmpHeadlines(key) : fetchFinnhubHeadlines(key),
  ]);

  return { events, headlines: recentHeadlines(headlines, now), fetchedAt: now };
}

// ============================================
// FINANCIAL MODELING PREP
// ============================================

interface FmpCalendarRow {
  date?: string;
  country?: string;
  event?: string;
  impact?: string;
  previous?: string | number | null;
  estimate?: string | number | null;
  actual?: string | number | null;
}

/** FMP's economic calendar for one day. UTC, per FMP's own FAQ. */
async function fetchFmpCalendar(apiKey: string, now: number): Promise<EconomicEvent[]> {
  const day = isoDay(now);
  const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${day}&to=${day}&apikey=${encodeURIComponent(apiKey)}`;
  const rows = await getJson<FmpCalendarRow[]>(url);
  if (!Array.isArray(rows)) return [];

  return rows
    .map(row => mapFmpCalendarRow(row))
    .filter((event): event is EconomicEvent => event !== null)
    .filter(event => event.affects.length > 0);
}

function mapFmpCalendarRow(row: FmpCalendarRow): EconomicEvent | null {
  if (!row.event || !row.date) return null;
  const country = (row.country ?? '').toUpperCase();
  const at = Date.parse(row.date.includes('T') ? row.date : row.date.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(at)) return null;
  const impact = normalizeImpact(row.impact);
  return {
    time: new Date(at).toISOString(),
    country,
    name: row.event,
    impact,
    previous: stringOrNull(row.previous),
    forecast: stringOrNull(row.estimate),
    actual: stringOrNull(row.actual),
    affects: [...affectsFor(row.event, country)],
  };
}

interface FmpNewsRow {
  title?: string;
  text?: string;
  site?: string;
  publishedDate?: string;
  url?: string;
}

/** FMP's latest general headlines. */
async function fetchFmpHeadlines(apiKey: string): Promise<NewsHeadline[]> {
  const url = `https://financialmodelingprep.com/stable/news/general-latest?limit=${HEADLINE_LIMIT}&apikey=${encodeURIComponent(apiKey)}`;
  const rows = await getJson<FmpNewsRow[]>(url);
  if (!Array.isArray(rows)) return [];
  return rows.map(row => mapHeadline(row.title ?? row.text, row.site, row.publishedDate, row.url)).filter(isHeadline);
}

// ============================================
// FINNHUB
// ============================================

interface FinnhubNewsRow {
  headline?: string;
  source?: string;
  datetime?: number;
  url?: string;
}

/**
 * Finnhub general headlines (free plan). Its economic calendar is premium, so
 * only headlines come from here.
 */
async function fetchFinnhubHeadlines(apiKey: string): Promise<NewsHeadline[]> {
  const url = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(apiKey)}`;
  const rows = await getJson<FinnhubNewsRow[]>(url);
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row =>
      mapHeadline(
        row.headline,
        row.source,
        typeof row.datetime === 'number' ? new Date(row.datetime * 1000).toISOString() : undefined,
        row.url
      )
    )
    .filter(isHeadline);
}

// ============================================
// SHARED
// ============================================

function stringOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function mapHeadline(
  title: string | undefined,
  source: string | undefined,
  time: string | undefined,
  url: string | undefined
): NewsHeadline | null {
  if (!title) return null;
  const at = time ? Date.parse(time) : NaN;
  if (!Number.isFinite(at)) return null;
  return {
    title: title.trim(),
    source: (source ?? 'Unknown').trim(),
    time: new Date(at).toISOString(),
    url: url ?? null,
  };
}

function isHeadline(value: NewsHeadline | null): value is NewsHeadline {
  return value !== null;
}

/** A GET returning parsed JSON, or null on any failure. Never throws. */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Keep only recent headlines, newest first, capped. */
export function recentHeadlines(headlines: NewsHeadline[], now: number): NewsHeadline[] {
  return headlines
    .filter(headline => {
      const at = Date.parse(headline.time);
      return Number.isFinite(at) && now - at <= HEADLINE_MAX_AGE_MS && at <= now + 60_000;
    })
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(0, HEADLINE_LIMIT);
}
