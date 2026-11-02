#!/usr/bin/env node
// ============================================
// npm run check:symbols
// ============================================
// Answers one question: which Twelve Data symbol should FlowSense use for Gold,
// S&P 500 and Dow on YOUR plan?
//
// It probes each instrument's discovery candidates from api/_lib/symbols.ts,
// makes one small time_series call per candidate, and prints a table showing
// which ones actually returned data. It never invents a result — a candidate that
// fails is printed with the vendor's own message.
//
// This is the ONE place that is allowed to try more than one symbol: it runs out
// of band, on a developer's machine, never inside a user request. The app itself
// requests only the configured symbol.
//
// Usage:
//   TWELVE_DATA_API_KEY=... npm run check:symbols
//   TWELVE_DATA_API_KEY=... npm run check:symbols -- --search gold
//
// The key is read from the environment or from a .env file. It is used only for
// these outbound calls; nothing is written anywhere.

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader, so the script needs no dependency. */
function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const path = resolve(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

loadDotEnv();

const API_KEY = (process.env.TWELVE_DATA_API_KEY ?? process.env.FUTURES_API_KEY ?? '').trim();
const API = 'https://api.twelvedata.com';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Load the configured symbols and the discovery candidate list from the app's
 * own source of truth.
 *
 * This script is plain Node and the mapping lives in TypeScript, so the module
 * is bundled on the fly rather than copied. Copying it would let the script and
 * the app drift, and a check that tests the wrong list is worse than none.
 */
async function loadSymbolCatalog() {
  const outdir = mkdtempSync(join(tmpdir(), 'flowsense-symbols-'));
  const outfile = join(outdir, 'symbols.mjs');
  try {
    await build({
      entryPoints: [resolve(ROOT, 'api/_lib/symbols.ts')],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      logLevel: 'silent',
    });
    const module = await import(pathToFileURL(outfile).href);
    return { configured: module.INSTRUMENT_SYMBOLS, candidates: module.DISCOVERY_CANDIDATES };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

async function timeSeries(symbol) {
  const params = new URLSearchParams({
    symbol,
    interval: '1day',
    outputsize: '2',
    apikey: API_KEY,
    format: 'JSON',
    timezone: 'UTC',
  });
  const response = await fetch(`${API}/time_series?${params}`);
  const payload = await response.json();
  if (payload.status === 'error') {
    return { ok: false, error: payload.message ?? 'error' };
  }
  const values = Array.isArray(payload.values) ? payload.values : [];
  if (values.length === 0) return { ok: false, error: 'no candles returned' };
  return {
    ok: true,
    candles: values.length,
    newest: values[0]?.datetime ?? '?',
    exchange: payload.meta?.exchange,
  };
}

async function symbolSearch(query) {
  const params = new URLSearchParams({ symbol: query, apikey: API_KEY, format: 'JSON' });
  const response = await fetch(`${API}/symbol_search?${params}`);
  const payload = await response.json();
  if (payload.status === 'error') return { ok: false, error: payload.message };
  return { ok: true, matches: Array.isArray(payload.data) ? payload.data.slice(0, 20) : [] };
}

function pad(text, width) {
  const value = String(text ?? '');
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

async function main() {
  if (!API_KEY) {
    console.error(`${RED}No API key found.${RESET}`);
    console.error('Set TWELVE_DATA_API_KEY in your environment or in a .env file, then re-run.');
    process.exitCode = 1;
    return;
  }

  const searchIndex = process.argv.indexOf('--search');
  const searchQuery = searchIndex !== -1 ? process.argv[searchIndex + 1] : null;

  let catalog;
  try {
    catalog = await loadSymbolCatalog();
  } catch (error) {
    console.error(`${RED}Could not load the symbol catalog:${RESET}`, error);
    process.exitCode = 1;
    return;
  }

  // Group the discovery candidates by instrument, in order.
  const byInstrument = new Map();
  for (const candidate of catalog.candidates) {
    const list = byInstrument.get(candidate.instrumentId) ?? [];
    list.push(candidate);
    byInstrument.set(candidate.instrumentId, list);
  }
  const configuredByInstrument = new Map(catalog.configured.map(entry => [entry.instrumentId, entry.symbol]));

  console.log(`\n${BOLD}FlowSense — Twelve Data symbol check${RESET}`);
  console.log(`${DIM}One 1day request per candidate. A failure is reported, never hidden.${RESET}`);
  console.log(`${DIM}The app requests only the configured symbol; this probes alternatives to find one.${RESET}\n`);

  for (const [instrumentId, candidates] of byInstrument) {
    const configured = configuredByInstrument.get(instrumentId);
    console.log(`${BOLD}${instrumentId} — ${configured?.description ?? instrumentId}${RESET}`);
    console.log(`${DIM}configured: ${configured?.symbol ?? '—'}${RESET}`);
    console.log(`${DIM}${pad('symbol', 12)}${pad('kind', 9)}${pad('result', 10)}detail${RESET}`);

    let chosen = null;

    for (const candidate of candidates) {
      let result;
      try {
        result = await timeSeries(candidate.symbol);
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : 'network error' };
      }

      if (result.ok) {
        const detail = `${result.candles} bars, newest ${result.newest}${result.exchange ? `, ${result.exchange}` : ''}`;
        console.log(
          `${pad(candidate.symbol, 12)}${pad(candidate.kind, 9)}${GREEN}${pad('WORKS', 10)}${RESET}${detail}`
        );
        if (!chosen) chosen = candidate;
      } else {
        console.log(
          `${pad(candidate.symbol, 12)}${pad(candidate.kind, 9)}${RED}${pad('FAILED', 10)}${RESET}${result.error}`
        );
      }
    }

    if (chosen) {
      const proxyNote =
        chosen.kind === 'proxy'
          ? ` ${YELLOW}(proxy — not the futures contract; the UI labels it as such)${RESET}`
          : '';
      console.log(`  ${GREEN}→ ${chosen.symbol} works — ${chosen.description}${RESET}${proxyNote}`);
      const envVar = catalog.configured.find(entry => entry.instrumentId === instrumentId)?.envVar;
      if (configured && configured.symbol !== chosen.symbol && envVar) {
        console.log(`    ${YELLOW}The app is configured for ${configured.symbol}. To use ${chosen.symbol} instead, set`);
        console.log(`    ${envVar}=${chosen.symbol} in the deployment.${RESET}`);
      }
    } else {
      const envVar = catalog.configured.find(entry => entry.instrumentId === instrumentId)?.envVar ?? 'SYMBOL_<ID>';
      console.log(
        `  ${RED}→ no candidate worked.${RESET} Set ${envVar}=<symbol> to pin one manually,`
      );
      console.log(`    or find one with: npm run check:symbols -- --search ${instrumentId}`);
    }
    console.log('');
  }

  if (searchQuery) {
    console.log(`${BOLD}symbol_search "${searchQuery}"${RESET}`);
    const result = await symbolSearch(searchQuery);
    if (!result.ok) {
      console.log(`${RED}${result.error}${RESET}\n`);
    } else if (result.matches.length === 0) {
      console.log(`${DIM}no matches${RESET}\n`);
    } else {
      console.log(`${DIM}${pad('symbol', 16)}${pad('type', 22)}${pad('exchange', 12)}name${RESET}`);
      for (const match of result.matches) {
        console.log(
          `${pad(match.symbol, 16)}${pad(match.instrument_type, 22)}${pad(match.exchange, 12)}${match.instrument_name ?? ''}`
        );
      }
      console.log('');
    }
  }

  console.log(
    `${DIM}Next: set TWELVE_DATA_API_KEY in Vercel (server-side) and deploy. The app requests only the\nconfigured symbol; use SYMBOL_GOLD / SYMBOL_SP500 / SYMBOL_DOW / SYMBOL_NASDAQ to change it to one that\nworks on your plan.${RESET}\n`
  );
}

main().catch(error => {
  console.error(`${RED}Unexpected failure:${RESET}`, error);
  process.exitCode = 1;
});
