// ============================================
// DEV API MIDDLEWARE (Vite, dev only)
// ============================================
// `npm run dev` serves the front end only: the api/ functions are Vercel
// serverless handlers, so without this middleware every /api/* request 404s and
// the app reports "no data source configured" even when a key is present.
//
// This plugin mounts the SAME handler files under /api/* in the Vite dev server,
// with a minimal adapter for the (req, res) shape the handlers expect. It is
// dev-only (`apply: 'serve'`), never bundled, and changes nothing about how the
// functions run in production: it only lets a developer exercise the real
// server-side code path locally.

import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, ViteDevServer } from 'vite';

const API_ROOT = 'api';

/** Resolve a request path to a handler file under api/, or null. */
function resolveHandler(root: string, pathname: string): string | null {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed.startsWith(`${API_ROOT}/`)) return null;
  // Reject traversal outright; only a plain api/**/*.ts path is allowed.
  if (trimmed.includes('..')) return null;

  const base = path.join(root, trimmed);
  const candidates = [`${base}.ts`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

/** Parse the query string into the string | string[] shape the handlers read. */
function parseQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else query[key] = [existing, value];
  }
  return query;
}

export function devApiPlugin(): Plugin {
  return {
    name: 'flowsense-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const rawUrl = req.url ?? '';
        if (!rawUrl.startsWith('/api/')) return next();

        const url = new URL(rawUrl, 'http://localhost');
        const handlerFile = resolveHandler(server.config.root, url.pathname);
        if (!handlerFile) return next();

        const apiReq = { method: req.method, query: parseQuery(url) };
        let settled = false;
        const apiRes = {
          status(code: number) {
            res.statusCode = code;
            return apiRes;
          },
          json(body: unknown) {
            if (settled) return;
            settled = true;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          },
          setHeader(name: string, value: string) {
            res.setHeader(name, value);
          },
          end() {
            if (settled) return;
            settled = true;
            res.end();
          },
        };

        try {
          const modulePath = `/${path.relative(server.config.root, handlerFile).split(path.sep).join('/')}`;
          const mod = (await server.ssrLoadModule(modulePath)) as {
            default: (req: unknown, res: unknown) => Promise<void>;
          };
          await mod.default(apiReq, apiRes);
          if (!settled) {
            res.statusCode = 200;
            res.end();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'dev api handler failed';
          console.error(`[dev-api] ${url.pathname} failed: ${message}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          res.end(JSON.stringify({ ok: false, error: { kind: 'UNKNOWN', message } }));
        }
      });
    },
  };
}
