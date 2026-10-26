# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite multi-timeframe market compass for Gold,
S&P 500 and Dow futures (GC/ES/YM). Every number is a provider response or
arithmetic over one. Nothing is simulated.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic values, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **Only ship markets we can source honestly.** Futures come from a configured
  provider. An instrument with no configured source shows "no data source
  configured" and no numbers at all — never a placeholder that looks real.
- **Keys stay server-side.** The futures provider's key is read only by the
  functions under `api/` and must never reach the browser. Verify the bundle
  stays credential-free: `grep -c "apikey" dist/assets/*.js` → must be 0. (A
  `FUTURES_API_KEY` hit in the bundle is fine only as the env-var *name* in help
  text, never a value.)

## Architecture

```
src/core/indicators.ts         pure indicator math, no I/O
src/core/votes.ts              per-indicator and per-MA vote logic
src/core/scoring.ts            gauge building, score -> label mapping
src/core/candles.ts            bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts    one timeframe -> the summary gauge
src/core/multiTimeframe.ts     every timeframe the entry check reads
src/core/entryCheck.ts         does the market agree with a long/short? (pure)
src/core/marketHours.ts        is the market still producing bars? (pure)
src/core/providers/            MarketDataProvider interface + the futures provider
src/core/providers/polling.ts  poll cadence + server cache TTLs (one place)
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts          every weight and tolerance setting
src/hooks/useInstrumentFeed.ts        candles and ticks for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the multi-timeframe engine
api/_lib/symbols.ts            the ONE place symbols are mapped + candidates ordered
api/_lib/twelvedata.ts         vendor adapter: request, parse, classify error kind
api/_lib/candleCache.ts        symbol resolution + short-lived candle cache
api/futures/candles.ts         server-side futures candle proxy
api/futures/status.ts          is a key configured, and what symbol resolved
api/futures/symbols.ts         symbol discovery, used by npm run check:symbols
scripts/checkSymbols.mjs       discovery CLI (bundles symbols.ts, no copy)
```

All indicator, scoring and history logic is pure and lives under `src/core` so
it can be unit tested without a browser. Keep it that way: no I/O, no clock, no
React in `src/core`.

### The futures feed is polled, or streamed when the server offers it

The provider is asked for candles on a cadence tied to the timeframe, and the
price is polled every `PRICE_POLL_INTERVAL_MS` (30s) when no tick feed is in
use. Because a polled close is not a tick, the status reads "Delayed (polling)"
— do not dress it as `LIVE`. When the server exposes a browser-safe price
stream, `subscribeTicks` uses it instead and the status can reach `LIVE`.

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

### Streaming, not polling

There is no candle-close poll and no manual refresh. `useInstrumentFeed` seeds
candle history with REST calls, then the provider's live feed carries updates:
high-frequency messages accumulate in refs and one coalesced snapshot commits to
React state every 200 ms, so the compass and price move within a second or two of
market activity without re-rendering on every tick.

Do not reintroduce a refresh timer, a countdown, or an interval tied to candle
close. A dropped socket triggers the client's capped-backoff reconnect; the UI
shows a reconnecting banner instead of presenting stale data as live.

### Timeframes are fetched, not aggregated from one series

Each timeframe is requested from the provider at its own interval, so a 1m seed
cannot cap how far back the weekly reaches. The live stream carries the 1m bar;
the newest bar of the mergeable timeframes (5m, 15m, 30m, 1h, 4h, 1D) is
refreshed from that 1m tail via `mergeLiveTail`, so a higher timeframe moves
with the market between fetches.

`mergeLiveTail` refuses a partial rebuild: a 1m window covers only hours, so a
daily bucket is usually only partly observed, and rebuilding it from that tail
would report a high/low/volume for a day that has barely started. When the base
window does not reach the bucket open, the natively fetched bar is kept.

## UI

The screen is a single compass. There is exactly ONE gauge: the Summary. The
moving-average and indicator blocks still feed its score, but they are not drawn
as gauges of their own, and the vote-count line ("B 7 · N 16 · S 1") is gone.
Do not re-add them: the compass shows the needle, the label and the score, and
nothing else.

Seven small timeframe buttons (M1 M5 M15 M30 1H 4H 1D) sit directly above the
compass and are pure selectors — no labels, scores or reading colours on them.
The top bar holds the logo, the asset buttons, the live price with its daily
change, the status dot and the last update time, and nothing else.

The Technical metrics section, the Market structure block, the Timeframe detail
section and the Multi-timeframe confluence block were all removed. Their code
(`src/core/metrics.ts`, `src/core/structure.ts`, `src/core/session.ts`, the ATR /
VWAP / POC helpers and `computeConfluence`) is deleted — do not bring any of it
back, and do not reintroduce a 1W timeframe.

All seven timeframes are still computed even though only one is drawn, because
the entry check reads every one of them. Keep it that way.

Every panel is permanently expanded. Do not add collapsible/show-hide controls,
accordions or any other click-to-reveal wrapper: all data must be visible on
page load.

## Score and labels

The score runs from -100 to +100 and its label is always derived from the score
through `labelFromScore`, so a positive score can never read Sell. Mapping:
>= +60 Strong Buy, +20..+59 Buy, -19..+19 Neutral, -59..-20 Sell, <= -60 Strong
Sell. Every weight and tolerance setting lives in
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
