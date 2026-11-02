# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite multi-timeframe market compass for Gold,
S&P 500, Dow Jones and Nasdaq (GC/ES/YM/NQ). Every number is a provider response
or arithmetic over one. Nothing is simulated.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic values, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **Only ship markets we can source honestly.** Every instrument comes from a
  configured provider. An instrument with no configured source shows "no data
  source configured" and no numbers at all — never a placeholder that looks real.
- **One symbol source.** The upstream symbol for every instrument lives in
  exactly ONE file, `src/config/symbols.ts` (overridable per instrument by the
  `SYMBOL_GOLD` / `SYMBOL_SP500` / `SYMBOL_DOW` / `SYMBOL_NASDAQ` environment
  variables). The shipped defaults are spot / ETF proxies (`XAU/USD`, `SPY`,
  `DIA`, `QQQ`), never the continuous-futures contracts `GC1!`/`ES1!`/`YM1!`/
  `NQ1!`, which Twelve Data does not entitle on every plan ("symbol or figi
  parameter is missing or invalid"). No code path builds a symbol from another
  source; the client learns what was requested from the server response.
- **Keys stay server-side.** The futures provider's key is read only by the
  functions under `api/` and must never reach the browser. Verify the bundle
  stays credential-free: `grep -c "apikey" dist/assets/*.js` → must be 0. (A
  `FUTURES_API_KEY` hit in the bundle is fine only as the env-var *name* in help
  text, never a value.)

## Architecture

```
src/core/indicators.ts         pure indicator math, no I/O
src/core/votes.ts              per-indicator and per-MA vote logic
src/core/scoring.ts            gauges, score -> label mapping, technical/summary blends
src/core/structure.ts          swing highs/lows, BOS, CHoCH, premium/discount
src/core/session.ts            session open resolution (RTH/FULL), DST-safe
src/core/metrics.ts            ATR, VWAP, session range, point of control
src/core/candles.ts            bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts    ONE timeframe -> the three compasses + structure + metrics
src/core/entryCheck.ts         do the selected timeframe's compasses agree with a long/short? (pure)
src/core/marketHours.ts        is the market still producing bars? (pure)
src/core/providers/            MarketDataProvider interface + the futures provider
src/core/providers/polling.ts  poll cadence + server cache TTLs (one place)
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/core/providers/orderflow.ts     OrderFlowProvider interface + the `none` adapter
src/config/compass.ts          every weight, tolerance and session setting
src/config/symbols.ts          the ONE place each instrument's upstream symbol is configured
src/hooks/useInstrumentFeed.ts        candles and ticks for one instrument
src/hooks/useTimeframeReadings.ts     one reading per (asset, timeframe), kept apart
api/_lib/creditMeter.ts        the per-minute meter that gates EVERY vendor call
api/_lib/symbols.ts            server-side reader of the symbol config + the SYMBOL_* env override
api/_lib/twelvedata.ts         vendor adapter: meter, request, parse, classify error kind
api/_lib/candleCache.ts        short-lived candle cache (one vendor call per TTL)
api/futures/candles.ts         server-side futures candle proxy
api/futures/status.ts          is a key configured, what symbol is read, meter state
api/futures/symbols.ts         symbol discovery, used by npm run check:symbols
api/orderflow/reading.ts       is an order-flow source configured, and its reading
api/_lib/orderflow.ts          THE file to edit to connect an order-flow vendor
scripts/checkSymbols.mjs       discovery CLI (bundles symbols.ts, no copy)
```

All indicator, scoring, structure, session and history logic is pure and lives
under `src/core` so it can be unit tested without a browser. Keep it that way:
no I/O, no clock, no React in `src/core`.

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

A symbol that returns no bars is a real "no bars here", not an error. There is
no candidate walk: the app requests the ONE configured symbol per instrument
(`configuredSymbol` in `api/_lib/symbols.ts`) and a failure returns an error for
that asset rather than spending another credit on a retry. A rate limit stops
everything until the minute resets. A failure that is not an entitlement problem
must not be reported as one.

### Every vendor call goes through the credit meter

`api/_lib/creditMeter.ts` is the single gate. `meteredFetch` in
`api/_lib/twelvedata.ts` checks it before the request and records the vendor's
own `api-credits-used` / `api-credits-left` headers after it, and logs one line
per request. Do not add a `fetch` to `api.twelvedata.com` outside that function:
a call that skips the meter is exactly how the account gets pinned at its
ceiling. Discovery (`api/futures/symbols.ts`, `npm run check:symbols`) is the
only code allowed to touch more than one symbol, and it runs out of band, never
inside a user request.

The meter is per serverless instance and in memory, so a cold instance starts
empty and is capped at `COLD_START_MAX_CREDITS` (3) for its first minute. A
rate-limit response marks the meter exhausted for the rest of the wall-clock
minute. The client shows its own "Rate limit — retrying in Xs" state with the
last series marked Stale; never surface the vendor's raw text.

### Streaming, not polling

There is no candle-close poll and no manual refresh. `useInstrumentFeed` seeds
candle history with REST calls, then the provider's live feed carries updates:
high-frequency messages accumulate in refs and one coalesced snapshot commits to
React state every 200 ms, so the compass and price move within a second or two of
market activity without re-rendering on every tick.

Do not reintroduce a candle-close refresh timer or an interval tied to candle
close. A dropped socket triggers the client's capped-backoff reconnect; the UI
shows a reconnecting banner instead of presenting stale data as live. The one
timer that is required is the rate-limit retry: it fires exactly once, after the
reset the server reported, and never in a loop.

### Timeframes are fetched, not aggregated from one series

There are seven timeframes (1m, 5m, 15m, 30m, 1h, 4h, 1D). Each is requested
from the provider at its own interval, so a 1m seed cannot cap how far back the
daily reaches — but only the SELECTED timeframe is fetched on load, one credit
each, and the rest load on demand when the user selects them. Do not reintroduce
a mount-time sweep of every timeframe: seven timeframes is seven credits, which
alone can spend a small plan's whole minute. Each request asks for at least 250
candles (`requestedCandles` in `src/config/compass.ts`) so EMA 200 is valid; a
wider window is still ONE request and so still one credit.

Readings are keyed by `asset:timeframe` in `useTimeframeReadings`, so switching
timeframes never mixes their series and a chip for a timeframe loaded earlier
still shows that timeframe's own reading and its age. The entry-check chip row
fills ONLY from timeframes already loaded this session; an unloaded timeframe
reads "Not loaded" and is never fetched to fill a chip.

The live stream carries the 1m bar;
the newest bar of the mergeable timeframes (5m, 15m, 30m, 1h, 4h, 1D) is
refreshed from that 1m tail via `mergeLiveTail`, so a higher timeframe moves
with the market between fetches.

`mergeLiveTail` refuses a partial rebuild: a 1m window covers only hours, so a
daily bucket is usually only partly observed, and rebuilding it from that tail
would report a high/low/volume for a day that has barely started. When the base
window does not reach the bucket open, the natively fetched bar is kept.

### Order flow is a separate provider, never derived from candles

The RIGHT compass is order flow: delta/CVD, order-book imbalance, absorption.
Twelve Data carries NO order-flow data — a candle has no aggressor side and no
order book — so it is never computed from the candle feed. It comes from a
provider behind `src/core/providers/orderflow.ts`, selected server-side by
`ORDERFLOW_PROVIDER` / `ORDERFLOW_API_KEY` (see `api/_lib/orderflow.ts`).

The shipped adapter is `none`: the card then reads "No order flow source
configured" and draws NO gauge. It must never draw a neutral needle or a `0` in
place of a missing reading — a neutral needle looks like a real "neutral market"
read. With no source the Summary compass IS the technical reading rather than a
blend against a stand-in zero.

Connecting a vendor means implementing `fetchOrderFlowReading` in
`api/_lib/orderflow.ts` and setting the two environment variables. Nothing else
changes: the client, the summary blend and the entry check already speak that
shape. The key stays server-side; check `grep -c "apikey" dist/assets/*.js` is
still 0 after adding one.

## UI

The main screen, top to bottom, and it fits 1920x1080 without scrolling: the top
bar (price, feed state, provenance, asset tabs, timeframe buttons), three
compasses in one row, then the merged technical table (two thirds) beside the
entry check (one third).

The timeframe buttons carry the LABEL ONLY — M1 M5 M15 M30 1H 4H 1D. No score,
no signal word, no colour that implies a signal; only the selected one is
highlighted, and every button is disabled while a request is in flight.

There is no multi-timeframe confluence grid, no "Timeframe detail" panel and no
separate "Technical metrics" panel. Do not re-add them. There is exactly ONE
technical table, holding both the moving averages and the oscillators.

The top bar holds the price and the asset tabs only. The removed "DATA: LIVE",
"CANDLES IN" countdown and REFRESH button were obsolete once the feed became
continuous — do not re-add them. Debug-style internals (raw data-quality
percentages, last-bar timestamps, candle counts) belong in a secondary section
below the primary view, not in the primary view.

Every panel is permanently expanded. Do not add collapsible/show-hide controls,
accordions or any other click-to-reveal wrapper: all data must be visible on
page load. Put secondary or debug content in its own always-visible section
instead of hiding it.

The header states the feed's real condition: a rate-limited feed shows our own
"Rate limit — retrying in Xs" countdown and a Stale badge on the last series.
Never render the vendor's raw error text, and never leave stale numbers looking
current.

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
npm run check:symbols   # out-of-band symbol discovery (needs a key)
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
```

The root `tsconfig.json` is solution-style (`files: []`), so `npm run typecheck`
and a bare `tsc --noEmit` check nothing at all. Always pass
`-p tsconfig.app.json`. `src/components/ui/*` carries pre-existing missing-module
errors (`cmdk`, several `@radix-ui/*` packages) and is not ours to fix, hence the
grep. `npm run lint` passes with 0 errors; the 6 remaining warnings are all
`react-refresh` notes in the vendored `src/components/ui/*`.

## Vendor request log

Every Twelve Data request logs one server-side line. Read it to answer "what
spent the credits?"; `vendorUsed`/`vendorLeft` come from the vendor's own
headers and are the source of truth.

```
[twelvedata] 2026-01-02T14:31:00.123Z endpoint=time_series symbol=XAU/USD timeframe=15m credits=1 status=200 vendorUsed=1 vendorLeft=7 meterUsed=1/8 meter=OK
[twelvedata] 2026-01-02T14:31:00.310Z endpoint=time_series symbol=SPY timeframe=15m credits=1 status=200 vendorUsed=2 vendorLeft=6 meterUsed=2/8 meter=OK
[twelvedata] 2026-01-02T14:31:00.501Z endpoint=time_series symbol=DIA timeframe=15m credits=1 status=200 vendorUsed=3 vendorLeft=5 meterUsed=3/8 meter=OK
```

A blocked call never reaches the vendor and logs `status=BLOCKED` with the
meter's reason instead.

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
