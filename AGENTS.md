# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite single-screen, multi-timeframe market
compass. Gold, S&P 500 and Dow Jones futures (GC/ES/YM) are the instruments —
futures only, no crypto. Every number is a provider response or arithmetic over
one. Nothing is simulated.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic series, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, "Reading unavailable") and an error kind.
- **Only ship markets we can source honestly.** Futures come from a configured
  provider. An instrument with no configured source shows "no data source
  configured" and no numbers at all — never a placeholder that looks real.
- **Keys stay server-side.** The futures provider's key is read only by the
  functions under `api/` and must never reach the browser. Verify the bundle
  stays credential-free: `grep -c "apikey" dist/assets/*.js` → must be 0.
- **No crypto anywhere.** There is no crypto provider, no exchange wording and
  no crypto instrument. The words "crypto", "Bitcoin", "BTC", "Binance" and
  "USDT" must not appear in the UI or the code.
- **Exactly seven timeframes.** M1, M5, M15, M30, 1H, 4H, 1D. There is no
  weekly. Do not add one back.

## Architecture

```
src/core/types.ts              Timeframe union + candle/gauge types
src/core/indicators.ts         pure indicator math, no I/O
src/core/votes.ts              per-indicator and per-MA vote logic
src/core/scoring.ts            gauges, score -> label mapping, overall bias
src/core/candles.ts            bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts    one timeframe -> the gauges
src/core/multiTimeframe.ts     every timeframe + the overall bias
src/core/entryCheck.ts         does the market agree with a long/short? (pure)
src/core/marketHours.ts        is the market still producing bars? (pure)
src/core/instruments.ts        the futures catalog (Gold, S&P 500, Dow)
src/core/providers/            MarketDataProvider interface + the futures provider
src/core/providers/polling.ts  poll cadence + server cache TTLs (one place)
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts          every weight, tolerance and entry-check setting
src/hooks/useInstrumentFeed.ts        candles + live price for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the multi-timeframe engine
api/_lib/symbols.ts            the ONE place symbols are mapped + candidates ordered
api/_lib/twelvedata.ts         vendor adapter: request, parse, classify error kind
api/_lib/candleCache.ts        symbol resolution + short-lived candle cache
api/futures/candles.ts         server-side futures candle proxy
api/futures/status.ts          is a key configured, and what symbol resolved
api/futures/symbols.ts         symbol discovery, used by npm run check:symbols
scripts/checkSymbols.mjs       discovery CLI (bundles symbols.ts, no copy)
```

All indicator, scoring and history logic is pure and lives under
`src/core` so it can be unit tested without a browser. Keep it that way: no I/O,
no clock, no React in `src/core`.

### Futures are polled

The provider is asked for candles on a cadence tied to the timeframe, and the
price is polled every `PRICE_POLL_INTERVAL_MS` (30s) when no live feed is in use.
Because a polled close is not a tick, the status reads "Delayed" — do not dress
it as "Live".

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

### Timeframes are fetched, not aggregated from one series

Each timeframe is requested from the provider at its own interval, so a 1m seed
cannot cap how far back the daily reaches. The newest bar of the mergeable
timeframes (5m, 15m, 30m, 1h, 4h, 1D) is refreshed from the live 1m tail via
`mergeLiveTail`, so a higher timeframe moves with the market between fetches.

`mergeLiveTail` refuses a partial rebuild: a 1m window covers only hours, so a
daily bucket is usually only partly observed, and rebuilding it from that tail
would report a high/low/volume for a day that has barely started. When the base
window does not reach the bucket open, the natively fetched bar is kept.

## UI

One screen at 1920x1080, no scrolling. Top bar: asset buttons, timeframe
buttons, live price, daily change, status dot and last update time. Three
columns: the timeframe list on the left (the ONLY place every timeframe
appears), the main compass in the centre, the entry check on the right. One
small provenance line at the bottom.

Every timeframe appears exactly once — in the left list. The entry check lists
only the timeframes that disagree with the chosen direction. Do not show the
same reading in two places.

Do not add tables, technical-metrics panels, structure blocks, small gray
helper captions, legends, confluence bars or extra gauges. Every panel is
permanently expanded; do not add collapsible/show-hide controls or any other
click-to-reveal wrapper.

## Score and labels

The score runs from -100 to +100 and its label is always derived from the score
through `labelFromScore`, so a positive score can never read Sell. Mapping:
>= +60 Strong Buy, +20..+59 Buy, -19..+19 Neutral, -59..-20 Sell, <= -60 Strong
Sell. Every weight, tolerance and entry-check setting lives in
`src/config/compass.ts` — change them there, not inline.

## Entry check

`checkEntry` (pure, in `src/core/entryCheck.ts`) judges whether the timeframes
agree with a LONG or SHORT. Its rules live in the `entryCheck` block of
`src/config/compass.ts`:

- ALIGNED  at least `minAligned` (default 5 of 7) agree AND no higher timeframe disagrees
- AGAINST  at most `maxAlignedForAgainst` (default 3) agree, OR most higher timeframes disagree
- PARTIAL  otherwise

A neutral timeframe counts as not agreeing but is never shown as disagreeing.
"Higher" timeframes default to 1H, 4H, 1D and are configurable. The verdict is
unit tested in `src/core/__tests__/entryCheck.test.ts`.

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
vitest under `src/core/__tests__`:

```
npm test
```

Watch out for warmup lengths: MACD(12,26,9) needs ~34 points, Bollinger(20,2)
needs 20. A "null" result usually means too few candles, not a broken indicator.
On a perfectly linear ramp MACD equals its signal line — use an accelerating
series to test a bullish crossover.
