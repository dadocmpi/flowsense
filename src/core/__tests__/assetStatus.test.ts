// ============================================
// PER-ASSET SOURCE MESSAGE TESTS
// ============================================
// The card's explanation must name the asset's OWN provider. This is the
// regression that made Nasdaq read as Twelve Data: the message borrowed the
// status route's global note ("Configured: twelvedata"), which lists whichever
// providers the deployment has, not the one the asset resolved to.

import { describe, expect, it } from 'vitest';
import { listAnd, missingSourceMessage, PROVIDER_DISPLAY_NAME } from '../assetStatus';
import { findInstrument } from '../instruments';
import type { AssetRequirementState } from '../providers/futures';

const NASDAQ = findInstrument('NQ')!;
const GOLD = findInstrument('GC')!;

const nasdaqRequirement: AssetRequirementState = {
  provider: 'alpaca',
  symbol: 'QQQ',
  credentialsPresent: false,
  requiredEnvVars: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
  missingEnvVars: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
};

const goldRequirement: AssetRequirementState = {
  provider: 'twelvedata',
  symbol: 'XAU/USD',
  credentialsPresent: false,
  requiredEnvVars: ['TWELVE_DATA_API_KEY'],
  missingEnvVars: ['TWELVE_DATA_API_KEY'],
};

describe('listAnd', () => {
  it('joins with commas and a trailing "and"', () => {
    expect(listAnd([])).toBe('');
    expect(listAnd(['A'])).toBe('A');
    expect(listAnd(['A', 'B'])).toBe('A and B');
    expect(listAnd(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('missingSourceMessage', () => {
  it('names Nasdaq, its provider Alpaca, and the missing variables', () => {
    const message = missingSourceMessage(NASDAQ, nasdaqRequirement, true);
    expect(message).toContain('Nasdaq');
    expect(message).toContain('Alpaca');
    expect(message).toContain('QQQ');
    expect(message).toContain('ALPACA_API_KEY');
    expect(message).toContain('ALPACA_API_SECRET');
  });

  it('never blames Twelve Data for an Alpaca asset', () => {
    const message = missingSourceMessage(NASDAQ, nasdaqRequirement, true);
    expect(message).not.toContain('Twelve Data');
    expect(message).not.toContain('TWELVE_DATA_API_KEY');
  });

  it('names Gold against Twelve Data', () => {
    const message = missingSourceMessage(GOLD, goldRequirement, true);
    expect(message).toContain('Gold');
    expect(message).toContain('Twelve Data');
    expect(message).toContain('TWELVE_DATA_API_KEY');
    expect(message).not.toContain('Alpaca');
  });

  it('falls back to the instrument\'s own provider when the route has not answered', () => {
    // No requirement yet: still must not name the wrong provider.
    const message = missingSourceMessage(NASDAQ, undefined, true);
    expect(message).toContain('Alpaca');
    expect(message).not.toContain('Twelve Data');
  });

  it('says the route did not answer when it is unreachable', () => {
    const message = missingSourceMessage(NASDAQ, undefined, false);
    expect(message).toContain('did not answer');
    expect(message).toContain('Alpaca');
  });

  it('uses singular grammar for a single missing variable', () => {
    const message = missingSourceMessage(GOLD, goldRequirement, true);
    expect(message).toContain('is not set');
  });

  it('never includes a credential value', () => {
    const message = missingSourceMessage(NASDAQ, nasdaqRequirement, true);
    expect(message).not.toMatch(/[A-Z0-9]{20,}/);
  });
});

describe('PROVIDER_DISPLAY_NAME', () => {
  it('labels the providers as people read them', () => {
    expect(PROVIDER_DISPLAY_NAME.twelvedata).toBe('Twelve Data');
    expect(PROVIDER_DISPLAY_NAME.alpaca).toBe('Alpaca');
  });
});
