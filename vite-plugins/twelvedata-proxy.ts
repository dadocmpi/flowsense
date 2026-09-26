import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { loadEnv } from 'vite';
import { handleTwelveDataRequest } from '../api/_twelvedata';

const PROXY_ROUTE = '/api/twelvedata';

/**
 * Serves the Twelve Data proxy during `vite dev`, mirroring the Vercel
 * serverless function in api/twelvedata.ts so the API key stays server-side
 * in both environments.
 */
export function twelveDataProxy(): Plugin {
  return {
    name: 'twelvedata-proxy',
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, process.cwd(), '');

      server.middlewares.use(PROXY_ROUTE, async (req, res) => {
        const request = req as IncomingMessage;
        const response = res as ServerResponse;

        if (request.method && request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
          return;
        }

        const url = new URL(request.url ?? '/', 'http://localhost');
        const params: Record<string, string> = {};
        for (const [key, value] of url.searchParams.entries()) {
          params[key] = value;
        }

        const endpoint = params.endpoint ?? 'time_series';
        delete params.endpoint;

        const result = await handleTwelveDataRequest({
          endpoint,
          params,
          apiKey: env.TWELVEDATA_API_KEY ?? process.env.TWELVEDATA_API_KEY,
        });

        response.statusCode = result.status;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', result.cacheSeconds > 0 ? `max-age=${result.cacheSeconds}` : 'no-store');
        response.end(JSON.stringify(result.body));
      });
    },
  };
}
