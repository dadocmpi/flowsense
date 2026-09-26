// ============================================
// VERCEL SERVERLESS ENTRYPOINT — /api/twelvedata
// ============================================
// Usage: /api/twelvedata?endpoint=time_series&symbol=XAU/USD&interval=5min&outputsize=200

import { handleTwelveDataRequest } from './_twelvedata.js';

interface MinimalRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface MinimalResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function collectParams(req: MinimalRequest): Record<string, string> {
  const params: Record<string, string> = {};

  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') params[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') params[key] = value[0];
    }
    return params;
  }

  const queryString = (req.url ?? '').split('?')[1] ?? '';
  for (const [key, value] of new URLSearchParams(queryString).entries()) {
    params[key] = value;
  }
  return params;
}

export default async function handler(req: MinimalRequest, res: MinimalResponse): Promise<void> {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Allow', 'GET');
    res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
    return;
  }

  const params = collectParams(req);
  const endpoint = params.endpoint ?? 'time_series';
  delete params.endpoint;

  const result = await handleTwelveDataRequest({
    endpoint,
    params,
    apiKey: process.env.TWELVEDATA_API_KEY,
  });

  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', result.cacheSeconds > 0 ? `s-maxage=${result.cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(result.body));
}
