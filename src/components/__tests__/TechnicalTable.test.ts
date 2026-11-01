// ============================================
// TECHNICAL TABLE TESTS
// ============================================
// The screen holds exactly ONE technical table, and it carries both blocks: the
// moving averages on the left, the oscillators on the right, each row a name, a
// value and a state. A second table, or a block rendered outside the table,
// would break the layout the design calls for.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TechnicalTable } from '../compass/TechnicalTable';
import type { VoteDetail } from '../../core/types';

function detail(name: string, group: VoteDetail['group']): VoteDetail {
  return { name, value: 1, display: '1.00', vote: 'BUY', group };
}

const MA = [detail('SMA 5', 'MA'), detail('SMA 10', 'MA'), detail('SMA 20', 'MA')];
const OSC = [detail('RSI (14)', 'OSCILLATOR'), detail('MACD (12,26,9)', 'OSCILLATOR')];

function render(details: VoteDetail[]): string {
  return renderToStaticMarkup(createElement(TechnicalTable, { details }));
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('TechnicalTable', () => {
  it('renders exactly one table, holding both blocks', () => {
    const html = render([...MA, ...OSC]);
    expect(count(html, '<table')).toBe(1);
    expect(html).toContain('Moving averages');
    expect(html).toContain('Oscillators');
  });

  it('gives every indicator a name, a value and a state', () => {
    const html = render([...MA, ...OSC]);
    for (const name of [...MA, ...OSC].map(entry => entry.name)) {
      expect(html).toContain(name);
    }
    // One state cell per indicator, and no second rendering of the block.
    expect(count(html, 'Buy')).toBe(MA.length + OSC.length);
  });

  it('pairs the blocks row by row when one is longer', () => {
    const html = render([...MA, ...OSC]);
    // Two header rows plus one row per member of the longer block.
    expect(count(html, '<tr')).toBe(2 + MA.length);
  });

  it('says so plainly when there is no data', () => {
    const html = render([]);
    expect(html).not.toContain('<table');
    expect(html).toContain('No data');
  });
});
