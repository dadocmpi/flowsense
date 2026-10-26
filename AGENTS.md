# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite multi-timeframe market compass. Gold,
S&P 500 and Dow futures (GC/ES/YM) are the default instruments; Binance USDT
spot pairs are a secondary group. Every number is a provider response or
arithmetic over one. Nothing is simulated.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic order flow, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **Only ship markets we can source honestly.** Crypto comes from Binance's
  public API. Futures come from a configured provider. An instrument with no
  configured source shows "no data source configured" and no numbers at all —
  never a placeholder that looks real.
- **Keys stay server-side.** Crypto needs no key. The futures provider's key is
  read only by the functions under `api/` and must never reach the browser.
  Verify the bundle stays credential-free:
  `grep -c "apikey" dist/assets/*.js` → must be 0. (A `FUTURES_API_KEY` hit in
  the bundle is fine only as the env-var *name* in help text, never a value.)
- **Order flow must be real.** Every bid, ask, trade and buy/sell percentage must
  come from the provider's own book and tape. Order flow is offered only by a
  provider that genuinely has it; a candle-only provider hides the panel with an
  explanation. Never estimate order flow from candles, and never reintroduce
  hardcoded values such as a fixed 50/50 buyer/seller split or a constant
  `volumeDelta` — an earlier version did exactly that, and it was a lie in the UI.

## Architecture

```
src/core/indicators.ts         pure indicator math, no I/O
src/core/votes.ts              per-indicator and per-MA vote logic
src/core/scoring.ts            gauges, score -> label mapping, confluence
src/core/structure.ts          swing highs/lows, BOS, CHoCH, premium/discount
src/core/session.ts            session open resolution (RTH/FULL), DST-safe
src/core/metrics.ts            ATR, VWAP, session range, point of control
src/core/candles.ts            bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts    one timeframe -> three gauges + structure + metrics
src/core/multiTimeframe.ts     every timeframe + the confluence bias
src/core/entryCheck.ts         does the market agree with a long/short? (pure)
src/core/marketHours.ts        is the market still producing bars? (pure)
src/core/providers/            MarketDataProvider interface, Binance, futures
src/core/providers/polling.ts  poll cadence + server cache TTLs (one place)
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts          every weight, tolerance and session setting
src/hooks/useInstrumentFeed.ts        candles, ticks, order flow for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the multi-timeframe engine
api/_lib/symbols.ts            the ONE place symbols are mapped + candidates ordered
api/_lib/twelvedata.ts         vendor adapter: request, parse, classify error kind
api/_lib/candleCache.ts        symbol resolution + short-lived candle cache
api/futures/candles.ts         server-side futures candle proxy
api/futures/status.ts          is a key configured, and what symbol resolved
api/futures/symbols.ts         symbol discovery, used by npm run check:symbols
scripts/checkSymbols.mjs       discovery CLI (bundles symbols.ts, no copy)
```

All indicator, scoring, structure, session and history logic is pure and lives
under `src/core` so it can be unit tested without a browser. Keep it that way:
no I/O, no clock, no React in `src/core`.

### Futures are polled; crypto is streamed

Crypto has a real push feed, so it streams. Futures do not: the provider is
asked for candles on a cadence tied to the timeframe, and the price is polled
every `PRICE_POLL_INTERVAL_MS` (30s) when no tick feed is in use. Because a
polled close is not a tick, the status reads "Delayed (polling)" — do not dress
it as `LIVE`.

The poll cadence and the server cache TTL live together in
`src/core/providers/polling.ts`. Every indicator is computed locally from
candles, so a refresh costs ONE request per symbol and timeframe, never one per
indicator; the server cache lets concurrent users share that call. Keep those
two facts true when touching the cadence — they are what keeps the credit spend
bounded.

A symbol that returns no bars is a real "no bars here", not an error: the
resolver walks to the next candidate. A rate limit is different and stops the
walk immediately, because the next candidate would just burn another blocked
call. A failure that is not an entitlement problem must not be reported as one
(see `resolveCandidate`).

### Streaming, not polling (crypto)

There is no candle-close poll and no manual refresh. `useInstrumentFeed` seeds
candle history with REST calls, then for crypto one combined
WebSocket carries everything live: `@ticker` (24h stats), `@kline_1m` (the open
base candle, pushed on every trade), `@depth10@100ms` and `@aggTrade`. High-frequency
stream messages accumulate in refs and one coalesced snapshot commits to React
state every 150 ms, so the compass, price and order flow all move within a
second or two of market activity without re-rendering on every trade.

Do not reintroduce a refresh timer, a countdown, or an interval tied to candle
close. A dropped socket triggers the client's capped-backoff reconnect; on the
next `LIVE` the hook re-seeds klines to refill the series, and the UI shows a
reconnecting banner instead of presenting stale data as live.

### Timeframes are fetched, not aggregated from one series

Each timeframe is requested from the provider at its own interval, so a 1m seed
cannot cap how far back the weekly reaches. The live stream carries the 1m bar;
the newest bar of the mergeable timeframes (5m, 15m, 30m, 1h, 4h, 1D) is
refreshed from that 1m tail via `mergeLiveTail`, so a higher timeframe moves
with the market between fetches.

`mergeLiveTail` refuses a partial rebuild: a 1m window covers only hours, so a
daily bucket is usually only partly observed, and rebuilding it from that tail
would report a high/low/volume for a day that has barely started. When the base
window does not reach the bucket open, the natively fetched bar is kept. Weekly
is excluded entirely: its exchange boundary (Monday open) is not the epoch-based
bucket, so a rebuild would put the bar at the wrong time. Do not "fix" that by
bucketing the weekly from 1m.

Host fallback order (REST and WS alike): `data-api.binance.vision` →
`api.binance.com` / `stream.binance.com:9443` → `api.binance.us` /
`stream.binance.us:9443`. Some regions get HTTP 451 on the main domains; the
client remembers the first host that answers. `data-api.binance.vision` and
`data-stream.binance.vision` are the official public market-data mirrors and are
the most reliable choice.

## UI

The top bar holds the price and the asset tabs only. The removed "DATA: LIVE",
"CANDLES IN" countdown and REFRESH button were obsolete once the feed became
continuous — do not re-add them. Debug-style internals (raw data-quality
percentages, last-bar timestamps, candle counts) belong in a secondary section
below the primary view, not in the primary view.

Every panel is permanently expanded. Do not add collapsible/show-hide controls,
accordions or any other click-to-reveal wrapper: all data must be visible on
page load. Put secondary or debug content in its own always-visible section
instead of hiding it.

## Real aggressor flow

- `aggTrade.m === true` means the **buyer was the maker**, so the seller
  aggressed → `SELL`. This is the exchange's own flag, not an inference.
- Kline field 9 is taker-buy base volume, a genuine per-candle aggressor split.
  `aggregateCandles` sums it so higher timeframes keep the split.

## Score and labels

The score runs from -100 to +100 and its label is always derived from the score
through `labelFromScore`, so a positive score can never read Sell. Mapping:
>= +60 Strong Buy, +20..+59 Buy, -19..+19 Neutral, -59..-20 Sell, <= -60 Strong
Sell. Every weight, tolerance and session setting lives in
`src/config/compass.ts` — change them there, not inline.

## Commands

```
npm run dev        # :8080
npm run build
npm test           # vitest
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
```

The root `tsconfig.json` is solution-style (`files: []`), so `npm run typecheck`
and a bare `tsc --noEmit` check nothing at all. Always pass
`-p tsconfig.app.json`. `src/components/ui/*` carries pre-existing missing-module
errors (`cmdk`, several `@radix-ui/*` packages) and is not ours to fix, hence the
grep. `npm run lint` passes with 0 errors; the 6 remaining warnings are all
`react-refresh` notes in the vendored `src/components/ui/*`.

## Testing indicator math

Indicators are pure functions, so verify them against hand-computed values with
esbuild + node (the repo now also has vitest under `src/core/__tests__`):

```
npx esbuild /tmp/check.mjs --bundle --format=esm --platform=node \
  --outfile=/tmp/bundle.mjs && node /tmp/bundle.mjs
```

Watch out for warmup lengths: MACD(12,26,9) needs ~34 points, Bollinger(20,2)
needs 20. A "null" result usually means too few candles, not a broken indicator.
On a perfectly linear ramp MACD equals its signal line — use an accelerating
series to test a bullish crossover.
