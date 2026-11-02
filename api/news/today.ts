// ============================================
// GET /api/news/today
// ============================================
// Server-side only. Reports whether a news source is configured and, when it is,
// returns today's economic calendar and the latest headlines for the "Today"
// panel. The vendor key is read here and never reaches the browser.
//
// It costs NO Twelve Data credits: the news vendor is a different service, and
// the snapshot is cached server-side for about five minutes so a burst of page
// loads shares one call.
//
// Response:
//   { configured, provider, label, note, snapshot }
//   snapshot is null when nothing is configured or nothing real came back.

import { sendJson, type ApiRequest, type ApiResponse } from '../_lib/futuresShared.js';
import {
  fetchNewsSnapshot,
  newsApiKey,
  newsConfigured,
  newsLabel,
  recentHeadlines,
  resolveNewsVendor,
} from '../_lib/news.js';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { kind: 'UNKNOWN', message: 'Only GET is supported' } });
    return;
  }

  const vendor = resolveNewsVendor();
  const configured = newsConfigured();

  if (!configured || !newsApiKey()) {
    sendJson(res, 200, {
      configured: false,
      provider: 'none',
      label: 'None',
      note: 'No news source configured. Set NEWS_PROVIDER and NEWS_API_KEY to enable it.',
      snapshot: null,
    });
    return;
  }

  try {
    const now = Date.now();
    const snapshot = await fetchNewsSnapshot(now);
    if (!snapshot) {
      sendJson(res, 200, {
        configured: true,
        provider: vendor,
        label: newsLabel(),
        note: 'The news source returned nothing.',
        snapshot: null,
      });
      return;
    }
    sendJson(res, 200, {
      configured: true,
      provider: vendor,
      label: newsLabel(),
      note: null,
      snapshot: { ...snapshot, headlines: recentHeadlines(snapshot.headlines, now) },
    });
  } catch (error) {
    // A failed vendor call is reported as no data, never as a fabricated one.
    sendJson(res, 200, {
      configured: true,
      provider: vendor,
      label: newsLabel(),
      note: error instanceof Error ? error.message : 'News request failed',
      snapshot: null,
    });
  }
}
