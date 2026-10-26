// ============================================
// SERVERLESS MODULE RESOLUTION TESTS
// ============================================
// These routes once deployed but crashed on every request with
// FUNCTION_INVOCATION_FAILED. package.json sets "type": "module", so Vercel
// emits the functions as native ESM without rewriting import specifiers, and a
// relative import with no extension is a Node resolution error. The app looked
// fine locally because Vite and vitest both resolve extensionless specifiers;
// only the deployed function was broken.
//
// The invariant: every relative import reachable from a route entry point
// carries an explicit ".js" extension, which Node requires and TypeScript
// maps back to the ".ts" source.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY_POINTS = ['futures/status.ts', 'futures/candles.ts', 'futures/symbols.ts'];

const RELATIVE_IMPORT = /from\s+'(\.[^']*)'/g;

/** Map a specifier onto the file it actually names. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = specifier.endsWith('.js')
    ? [base.slice(0, -3) + '.ts', base]
    : [`${base}.ts`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

interface FoundImport {
  /** The importing file, relative to api/. */
  file: string;
  specifier: string;
  /** The file the specifier names, or null when it resolves to nothing. */
  resolved: string | null;
}

/** Every relative import reachable from one entry point. */
function reachableImports(entryPoint: string): FoundImport[] {
  const found: FoundImport[] = [];
  const seen = new Set<string>();

  const walk = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);

    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const specifier = match[1];
      const resolved = resolveSpecifier(specifier, file);
      found.push({ file: path.relative(apiDir, file), specifier, resolved });
      if (resolved && resolved.endsWith('.ts')) walk(resolved);
    }
  };

  walk(path.join(apiDir, entryPoint));
  return found;
}

describe('serverless module resolution', () => {
  it('finds imports to check', () => {
    // Guards the walker itself: if it silently returned nothing, the assertion
    // below would pass while checking no imports at all.
    const imports = reachableImports(ENTRY_POINTS[0]);
    expect(imports.length).toBeGreaterThan(0);
  });

  it.each(ENTRY_POINTS)('gives every relative import in %s an explicit .js extension', entryPoint => {
    const offenders = reachableImports(entryPoint)
      .filter(entry => !entry.specifier.endsWith('.js'))
      .map(entry => `${entry.file}: ${entry.specifier}`);

    expect(offenders).toEqual([]);
  });

  it('resolves every relative import to a real file', () => {
    const unresolved = ENTRY_POINTS.flatMap(entryPoint =>
      reachableImports(entryPoint)
        .filter(entry => entry.resolved === null)
        .map(entry => `${entry.file}: ${entry.specifier}`)
    );

    expect(unresolved).toEqual([]);
  });
});
