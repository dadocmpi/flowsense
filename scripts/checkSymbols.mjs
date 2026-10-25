#!/usr/bin/env node
// ============================================
// npm run check:symbols
// ============================================
// Answers one question: which Twelve Data symbol should FlowSense use for Gold,
// S&P 500 and Dow on YOUR plan?
//
// It walks each instrument's candidate list from api/_lib/symbols.ts, makes one
// small time_series call per candidate, and prints a table showing which ones
// actually returned data. It never invents a result — a candidate that fails is
// printed with the vendor's own message.
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
 * Load the candidate lists from the app's own source of truth.
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
    return module.INSTRUMENT_SYMBOLS;
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

  let INSTRUMENTS;
  try {
    INSTRUMENTS = await loadSymbolCatalog();
  } catch (error) {
    console.error(`${RED}Could not load the symbol catalog:${RESET}`, error);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${BOLD}FlowSense — Twelve Data symbol check${RESET}`);
  console.log(`${DIM}One 1day request per candidate. A failure is reported, never hidden.${RESET}\n`);

  for (const instrument of INSTRUMENTS) {
    console.log(`${BOLD}${instrument.instrumentId} — ${instrument.name}${RESET}`);
    console.log(`${DIM}${pad('symbol', 12)}${pad('kind', 9)}${pad('result', 10)}detail${RESET}`);

    let chosen = null;

    for (const candidate of instrument.candidates) {
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
      console.log(`  ${GREEN}→ using ${chosen.symbol} — ${chosen.description}${RESET}${proxyNote}`);
    } else {
      console.log(
        `  ${RED}→ no candidate worked.${RESET} Set TWELVE_DATA_SYMBOL_${instrument.instrumentId}=<symbol> to pin one manually,`
      );
      console.log(`    or find one with: npm run check:symbols -- --search ${instrument.name}`);
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
    `${DIM}Next: set TWELVE_DATA_API_KEY in Vercel (server-side) and deploy. The app resolves the\nsymbol itself on first request; use TWELVE_DATA_SYMBOL_<ID> only to pin a specific one.${RESET}\n`
  );
}

main().catch(error => {
  console.error(`${RED}Unexpected failure:${RESET}`, error);
  process.exitCode = 1;
});
