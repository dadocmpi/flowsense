import { describe, expect, it } from 'vitest';
import { parseFlowMessage, tradeSide } from '../parse';

describe('aggressor-side mapping (the m flag)', () => {
  it('m=true means the BUYER was resting, so the AGGRESSOR was the SELLER', () => {
    expect(tradeSide(true)).toBe('SELL');
  });

  it('m=false means the aggressor was the BUYER', () => {
    expect(tradeSide(false)).toBe('BUY');
  });

  it('maps the m flag on a real combined-stream trade frame', () => {
    const raw = JSON.stringify({
      stream: 'xauusdt@trade',
      data: { e: 'trade', E: 1794170041753, T: 1794170041753, s: 'XAUUSDT', t: 232806096, p: '4066.60', q: '0.626', X: 'MARKET', m: true },
    });
    const parsed = parseFlowMessage(raw, 1_000);
    expect(parsed.kind).toBe('TRADE');
    if (parsed.kind !== 'TRADE') return;
    expect(parsed.print.side).toBe('SELL');
    expect(parsed.print.buyerIsMaker).toBe(true);
    expect(parsed.print.price).toBeCloseTo(4066.6, 6);
    expect(parsed.print.qty).toBeCloseTo(0.626, 6);
    expect(parsed.print.time).toBe(1794170041753);
  });

  it('maps m=false to a BUY aggressor on a raw (unwrapped) frame', () => {
    const raw = JSON.stringify({ e: 'trade', T: 5, p: '10.5', q: '2', m: false, t: 7 });
    const parsed = parseFlowMessage(raw, 1_000);
    expect(parsed.kind).toBe('TRADE');
    if (parsed.kind !== 'TRADE') return;
    expect(parsed.print.side).toBe('BUY');
  });
});

describe('partial depth parsing', () => {
  it('parses top-20 levels, best-first on both sides', () => {
    const raw = JSON.stringify({
      stream: 'xauusdt@depth20@100ms',
      data: {
        e: 'depthUpdate',
        E: 1_794_170_007_052,
        T: 1_794_170_007_047,
        u: 999,
        b: [['4066.55', '1.169'], ['4066.60', '11.448'], ['4066.59', '0.294']],
        a: [['4066.70', '3'], ['4066.61', '50.289'], ['4066.65', '2']],
      },
    });
    const parsed = parseFlowMessage(raw, 2_000);
    expect(parsed.kind).toBe('DEPTH');
    if (parsed.kind !== 'DEPTH') return;
    expect(parsed.snapshot.bids.map(l => l.price)).toEqual([4066.6, 4066.59, 4066.55]);
    expect(parsed.snapshot.asks.map(l => l.price)).toEqual([4066.61, 4066.65, 4066.7]);
    expect(parsed.snapshot.updateId).toBe(999);
    expect(parsed.snapshot.receivedAt).toBe(2_000);
  });

  it('parses a real captured venue frame exactly (m=false -> BUY aggressor)', () => {
    const parsed = parseFlowMessage(`{"stream":"xauusdt@trade","data":{"e":"trade","E":1794171667824,"T":1794171667824,"s":"XAUUSDT","t":232809026,"p":"4064.84","q":"0.106","X":"MARKET","m":false,"st":1}}`, 1_794_171_667_824);
    expect(parsed.kind).toBe('TRADE');
    if (parsed.kind !== 'TRADE') return;
    expect(parsed.print.side).toBe('BUY');
    expect(parsed.print.price).toBeCloseTo(4064.84, 2);
    expect(parsed.print.qty).toBeCloseTo(0.106, 3);
  });

  it('parses a real captured book ticker', () => {
    const parsed = parseFlowMessage(`{"stream":"xauusdt@bookTicker","data":{"e":"bookTicker","u":12050657783589,"s":"XAUUSDT","ps":"XAUUSDT","b":"4064.83","B":"28.894","a":"4064.84","A":"15.577","T":1794171667824,"E":1794171667824,"st":1}}`, 1_794_171_667_824);
    expect(parsed.kind).toBe('BOOK_TICKER');
    if (parsed.kind !== 'BOOK_TICKER') return;
    expect(parsed.ticker.bidPrice).toBeCloseTo(4064.83, 2);
    expect(parsed.ticker.askPrice).toBeCloseTo(4064.84, 2);
  });

  it('parses a real captured top-20 partial depth frame', () => {
    const parsed = parseFlowMessage(`{"stream":"xauusdt@depth20@100ms","data":{"e":"depthUpdate","E":1794171667830,"T":1794171667826,"s":"XAUUSDT","ps":"XAUUSDT","U":12050657749419,"u":12050657783675,"pu":12050657746922,"b":[["4064.83","28.894"],["4064.82","6.066"],["4064.80","7.148"],["4064.79","3.359"],["4064.78","4.881"],["4064.77","0.002"],["4064.76","0.002"],["4064.75","6.959"],["4064.74","4.884"],["4064.73","0.073"],["4064.70","1.175"],["4064.69","1.524"],["4064.68","0.002"],["4064.67","0.004"],["4064.66","0.011"],["4064.65","2.850"],["4064.64","0.490"],["4064.63","3.112"],["4064.61","0.016"],["4064.60","1.206"]],"a":[["4064.84","15.577"],["4064.85","1.173"],["4064.88","1.427"],["4064.89","2.875"],["4064.90","1.187"],["4064.91","0.002"],["4064.94","0.004"],["4064.95","1.299"],["4064.96","0.054"],["4064.97","0.006"],["4064.98","3.018"],["4064.99","0.006"],["4065.00","0.375"],["4065.01","1.313"],["4065.02","4.000"],["4065.07","0.012"],["4065.08","0.431"],["4065.10","0.008"],["4065.11","0.008"],["4065.12","0.032"]],"st":1}}`, 1_794_171_667_826);
    expect(parsed.kind).toBe('DEPTH');
    if (parsed.kind !== 'DEPTH') return;
    expect(parsed.snapshot.bids.length).toBe(20);
    expect(parsed.snapshot.asks.length).toBe(20);
    // Best bid below best ask, and both sides sorted best-first.
    expect(parsed.snapshot.bids[0].price).toBeLessThan(parsed.snapshot.asks[0].price);
    expect(parsed.snapshot.bids[0].price).toBeGreaterThanOrEqual(parsed.snapshot.bids[1].price);
    expect(parsed.snapshot.asks[0].price).toBeLessThanOrEqual(parsed.snapshot.asks[1].price);
  });

  it('returns UNKNOWN for garbage, never throwing', () => {
    expect(parseFlowMessage('not json').kind).toBe('UNKNOWN');
    expect(parseFlowMessage('{"e":"depthUpdate"}').kind).toBe('UNKNOWN');
    expect(parseFlowMessage('{}').kind).toBe('UNKNOWN');
  });
});

describe('book ticker parsing', () => {
  it('parses the best bid/ask with sizes', () => {
    const raw = JSON.stringify({
      stream: 'xauusdt@bookTicker',
      data: { e: 'bookTicker', u: 1, s: 'XAUUSDT', b: '4066.60', B: '8.635', a: '4066.61', A: '50.289', T: 1_794_170_041_453 },
    });
    const parsed = parseFlowMessage(raw, 3_000);
    expect(parsed.kind).toBe('BOOK_TICKER');
    if (parsed.kind !== 'BOOK_TICKER') return;
    expect(parsed.ticker.bidPrice).toBe(4066.6);
    expect(parsed.ticker.bidSize).toBe(8.635);
    expect(parsed.ticker.askPrice).toBe(4066.61);
    expect(parsed.ticker.askSize).toBe(50.289);
  });
});
