// ============================================
// SERVER NEWS ADAPTER TESTS
// ============================================
// The adapter reads its vendor from the environment and maps a vendor payload
// onto the snapshot the panel expects. These use a stubbed fetch: no real key is
// needed, and the mapping is asserted against the vendors' documented shapes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearNewsSnapshotCache,
  fetchNewsSnapshot,
  newsApiKey,
  newsConfigured,
  newsLabel,
  recentHeadlines,
  resolveNewsVendor,
} from '../news';

const ENV_KEYS = ['NEWS_PROVIDER', 'NEWS_API_KEY'];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('news vendor selection', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    clearNewsSnapshotCache();
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
  });

  it('is none when nothing is set', () => {
    expect(resolveNewsVendor()).toBe('none');
    expect(newsConfigured()).toBe(false);
    expect(newsLabel()).toBe('None');
  });

  it('is fmp when selected', () => {
    process.env.NEWS_PROVIDER = 'fmp';
    process.env.NEWS_API_KEY = 'k';
    expect(resolveNewsVendor()).toBe('fmp');
    expect(newsConfigured()).toBe(true);
    expect(newsLabel()).toBe('Financial Modeling Prep');
  });

  it('is finnhub when selected', () => {
    process.env.NEWS_PROVIDER = 'finnhub';
    process.env.NEWS_API_KEY = 'k';
    expect(resolveNewsVendor()).toBe('finnhub');
    expect(newsLabel()).toBe('Finnhub');
  });

  it('needs a key even when a vendor is named', () => {
    process.env.NEWS_PROVIDER = 'fmp';
    expect(newsApiKey()).toBeNull();
    expect(newsConfigured()).toBe(false);
  });

  it('returns no snapshot when nothing is configured', async () => {
    expect(await fetchNewsSnapshot()).toBeNull();
  });
});

describe('news snapshot mapping (fmp)', () => {
  beforeEach(() => {
    process.env.NEWS_PROVIDER = 'fmp';
    process.env.NEWS_API_KEY = 'test-key';
    clearNewsSnapshotCache();
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
  });

  it('maps the calendar, filters to tracked assets, and tags "affects"', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('economic-calendar')) {
        return jsonResponse([
          {
            date: '2024-06-10 12:30:00',
            country: 'US',
            event: 'CPI (YoY)',
            impact: 'high',
            previous: '3.4',
            estimate: '3.3',
            actual: null,
          },
          {
            date: '2024-06-10 13:00:00',
            country: 'NZ',
            event: 'Some Regional Housing Print',
            impact: 'low',
            previous: null,
            estimate: null,
            actual: null,
          },
        ]);
      }
      return jsonResponse([
        { title: 'Gold rallies on CPI', site: 'Example Wire', publishedDate: '2024-06-10T11:55:00Z', url: 'https://example.com/a' },
      ]);
    });

    const now = Date.UTC(2024, 5, 10, 12, 0, 0);
    const snapshot = await fetchNewsSnapshot(now);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.events).toHaveLength(1);
    const event = snapshot!.events[0];
    expect(event.name).toBe('CPI (YoY)');
    expect(event.impact).toBe('High');
    expect(event.country).toBe('US');
    expect(event.previous).toBe('3.4');
    expect(event.forecast).toBe('3.3');
    expect(event.actual).toBeNull();
    expect(event.affects).toEqual(['USD', 'Gold', 'US indices']);
    expect(snapshot!.headlines).toHaveLength(1);
    expect(snapshot!.headlines[0].source).toBe('Example Wire');
  });

  it('caches the snapshot so a second call makes no vendor request', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return jsonResponse([]);
    });
    const now = Date.UTC(2024, 5, 10, 12, 0, 0);
    await fetchNewsSnapshot(now);
    await fetchNewsSnapshot(now + 1_000);
    expect(calls).toBe(2); // one calendar + one headlines, once.
  });
});

describe('headline filtering', () => {
  const now = Date.UTC(2024, 5, 10, 12, 0, 0);

  it('keeps only recent headlines, newest first', () => {
    const headlines = [
      { title: 'old', source: 'a', time: new Date(now - 48 * 3600_000).toISOString(), url: null },
      { title: 'newer', source: 'b', time: new Date(now - 60_000).toISOString(), url: null },
      { title: 'newest', source: 'c', time: new Date(now - 30_000).toISOString(), url: null },
    ];
    const kept = recentHeadlines(headlines, now);
    expect(kept.map(h => h.title)).toEqual(['newest', 'newer']);
  });
});
