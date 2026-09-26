# FlowSense

Trading analysis dashboard. Market data comes from **Binance public market
data** — no API key, no proxy, and no fabricated values anywhere.

## Scope: crypto only, for now

The app deliberately covers a small set of Binance USDT spot pairs. That is the
one market we can source honestly end to end: Binance's public API gives real
candles, a real order book and a real tick-by-tick trade tape, all without
credentials.

Stocks, forex and indices are a later addition. They are not offered today
because we have no source for them that also provides genuine order flow, and
showing those markets with modelled flow would mean faking it.

## Data source: Binance public API

Two public, unauthenticated feeds are used, both with
`access-control-allow-origin: *` so the browser talks to them directly:

| Feed | Endpoint | Used for |
| --- | --- | --- |
| REST klines | `/api/v3/klines` | 300 × 5m candles, plus the real per-candle taker-buy split |
| REST 24h ticker | `/api/v3/ticker/24hr` | price, change, high/low, volume |
| WebSocket `@ticker` | combined stream | live price in between REST refreshes |
| WebSocket `@depth10@100ms` | combined stream | top-10 order book, refreshed 10×/s |
| WebSocket `@aggTrade` | combined stream | aggregated trade tape (the tick-by-tick flow) |

Binance runs several regional domains and blocks some of them from some
locations (HTTP 451). `src/lib/binanceClient.ts` tries the official hosts in
order — `data-api.binance.vision`, `api.binance.com`, `api.binance.us` — and
remembers whichever answers, so a geo-block on one domain is not fatal. The same
fallback list exists for WebSocket hosts. If every host is blocked the app shows
a `GEO_BLOCKED` error instead of inventing data.

Everything derived is arithmetic over a real feed:

- Indicators (SMA/EMA/RSI/MACD/Bollinger/ATR/VWAP/volume profile) are computed
  locally from real candles in `src/lib/indicators.ts`.
- Buy/sell pressure comes from the `m` flag on each `aggTrade` — Binance sets it
  true when the buyer was the maker, so the aggressor side is known, not guessed.
- Cumulative delta comes from the kline taker-buy field (index 9), a real
  aggressor split, not an estimate.

## Setup

```
npm install && npm run dev   # → http://localhost:8080/
```

No key, no `.env`, no server-side component is required.

## Layout

```
src/lib/binanceClient.ts       REST + WebSocket client, host fallback, error mapping
src/lib/indicators.ts          pure indicator math, no I/O
src/lib/marketAnalysis.ts      candle aggregation, derived ranges, indicator set
src/hooks/useMarketData.ts     the single data entry point (REST + stream)
src/hooks/useCompassSignal.ts  orchestrates the real hooks
src/components/trading/RealtimeOrderFlow.tsx   order book, tape, buy/sell split
```

## Commands

```
npm run dev        # dev server on :8080
npm run build      # production build
npm run lint
```

For type checking, target the app project explicitly. The root `tsconfig.json`
is solution-style (`files: []`), so `npm run typecheck` / bare `tsc --noEmit`
checks nothing. Vendored `src/components/ui/*` has pre-existing missing-module
errors that predate this work; filter them out:

```
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
```
