# FlowSense

Multi-timeframe market compass. **Gold, S&P 500, Dow and Nasdaq** are the four
assets this app ships, served by Twelve Data through a server-side route.

Every number is either a provider response or arithmetic over one. Where a
figure is not available the app shows an explicit unavailable state — nothing is
simulated, modelled or back-filled.

## Assets and symbols

The defaults work on the Twelve Data **free plan**. The vendor's continuous
futures contracts (`GC1!`, `ES1!`, `YM1!`, `NQ1!`) are not available there, so
the shipped symbols are spot / ETF proxies:

| Asset | Id | Default symbol | What it is | Kind |
| --- | --- | --- | --- | --- |
| Gold | GC | `XAU/USD` | Gold spot | proxy |
| S&P 500 | ES | `SPY` | SPDR S&P 500 ETF | proxy |
| Dow Jones | YM | `DIA` | SPDR Dow Jones ETF | proxy |
| Nasdaq 100 | NQ | `QQQ` | Invesco QQQ Trust, Nasdaq-100 ETF | proxy |

Each is a **proxy**, not the futures contract, and the UI labels it as one — the
`PROXY` badge on the provenance line. There is exactly ONE symbol per asset and
**no runtime probing**: the app requests that symbol and a failure returns an
error for that asset rather than spending another credit hunting for one.

Each symbol is overridable in ONE place by an environment variable:

| Variable | Asset | Default |
| --- | --- | --- |
| `SYMBOL_GOLD` | Gold | `XAU/USD` |
| `SYMBOL_SP500` | S&P 500 | `SPY` |
| `SYMBOL_DOW` | Dow | `DIA` |
| `SYMBOL_NASDAQ` | Nasdaq | `QQQ` |

A value ending in `!` (e.g. `GC1!`) is reported as a futures contract; anything
else is reported as a proxy. The legacy `TWELVE_DATA_SYMBOL_GC` / `_ES` / `_YM`
names are still honoured.

Assets load **independently**: one failing asset never blocks or hides another.

## Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, shown as `M1`, `M5`, `M15`, `M30`,
`1H`, `4H`, `1D`. Each is fetched natively from the provider at its own interval,
so a 1m seed cannot cap how far back the daily reaches. Each request asks for 300
candles (`requestedCandles` in `src/config/compass.ts`), enough for EMA 200.

The entry check needs every timeframe, so selecting an asset loads **all seven**,
one request at a time, in this order: the timeframe you are looking at first, then
the rest highest-first (1D, 4H, 1H, 30m, 15m, 5m, 1m). Chips fill progressively
and read "Loading" until their data lands.

## The compass

Three gauges for the selected timeframe:

1. **Technical indicators** — SMA and EMA over 5, 10, 20, 50, 100, 200 plus
   RSI(14), Stochastic(9,6), Stochastic RSI(14), MACD(12,26,9), ADX(14),
   Williams %R(14), CCI(14), ATR(14), Highs/Lows(14), Ultimate Oscillator, ROC and
   Bull/Bear Power(13). Each line votes Buy above its level, Sell below, Neutral
   inside a tolerance band.
2. **Summary** — the technical read blended with order flow, in the center.
3. **Order flow** — delta / CVD, book imbalance, absorption. Twelve Data has no
   order-flow data, so with the shipped `none` provider the card reads "No order
   flow source configured" and draws no gauge. It never shows a neutral needle.

Score to label mapping, applied everywhere and asserted by tests:

| Score | Label |
| --- | --- |
| ≥ +60 | Strong Buy |
| +20 … +59 | Buy |
| −19 … +19 | Neutral |
| −59 … −20 | Sell |
| ≤ −60 | Strong Sell |

The label is always derived from the score's sign, so a positive score can never
read as Sell.

### Weights

All weights live in one file: `src/config/compass.ts`.

- `indicatorWeights` — per-indicator weight inside the oscillator block.
- `maWeights` — per-period weight inside the moving-average block.
- `technicalBlend` — how the MA block and the oscillator block combine.
- `orderFlowBlend` — how the technical read and order flow combine into the
  summary (ignored when no order-flow source is configured).
- `timeframeWeights` — how much each timeframe counts in the entry check.
- `timeframeTtlMs` — the per-timeframe cache TTL.
- `maTolerancePercent` — the Neutral band around each moving average.
- `thresholds` — the score cut-offs behind the five labels.
- `entryCheck` — the rules behind the LONG / SHORT entry check:
  `higherTimeframes`, `warnOnHigherTimeframeDisagreement`, `alignedShare` and
  `againstShare`.
- `session` — `mode` (`RTH` or `FULL`), `timezone`, and the open times.

| Timeframe | Weight | Cache TTL |
| --- | --- | --- |
| M1 | 0.2 | 60s |
| M5 | 0.6 | 120s |
| M15 | 1.0 | 300s |
| M30 | 1.2 | 600s |
| 1H | 1.6 | 900s |
| 4H | 1.8 | 1800s |
| 1D | 2.0 | 3600s |

## Entry check

The entry check answers whether the market agrees with the trade you are about to
take. It sits **full width directly above the three compasses** and is always
visible: the LONG / SHORT toggle never disappears.

Pick LONG or SHORT and every timeframe is classified as **Agrees**, **Disagrees**,
**Neutral**, **No data** or **Loading**. The verdict is **Aligned**, **Partial** or
**Against**. A timeframe still in flight reads "Loading" — a fact about us — rather
than "No data", which is a fact about the market. The three higher timeframes
(1H, 4H, 1D) are tagged `higher`.

Agreement is weighted by `timeframeWeights`, so higher timeframes carry more, and
measured only across timeframes that took a side: a neutral timeframe neither
helps nor hurts. A single higher-timeframe disagreement stops the verdict being
Aligned and raises the red "Higher timeframe conflict" warning. The logic is pure
(`src/core/entryCheck.ts`) and covered by
`src/core/__tests__/entryCheck.test.ts`.

## Market structure

Per timeframe, a lightweight Smart Money Concepts read: the last break of
structure (BOS), the last change of character (CHoCH), and whether price sits in
the premium or discount half of the last swing range. Pure function in
`src/core/structure.ts`.

## Technical metrics

ATR(14), VWAP, session high/low and the volume point of control. VWAP, the range
and the POC reset at the session open — `RTH` or `FULL`, selected in config.

## Data providers

Candles come through a provider abstraction (`MarketDataProvider` in
`src/core/providers/types.ts`):

```ts
getCandles(instrument, timeframe, limit, signal): Promise<Candle[]>
subscribeTicks?(instrument, handlers): StreamHandle   // optional
```

- **Twelve Data** (`src/core/providers/futures.ts`) — all four assets, proxied
  through `/api/futures/candles` so the key stays server-side. Candles plus a
  polled price (or a browser-safe stream when the server offers one).

### Twelve Data configuration

Set these in the Vercel project (Settings → Environment Variables) or in a local
`.env.local` (copy `.env.example` as a starting point). They are read **only** by
the serverless functions under `api/`, never by the browser bundle.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TWELVE_DATA_API_KEY` | yes | — | Server-side credential. The only variable you must set. |
| `SYMBOL_GOLD` | no | `XAU/USD` | The one symbol Gold reads. |
| `SYMBOL_SP500` | no | `SPY` | The one symbol S&P 500 reads. |
| `SYMBOL_DOW` | no | `DIA` | The one symbol Dow reads. |
| `SYMBOL_NASDAQ` | no | `QQQ` | The one symbol Nasdaq reads. |
| `TWELVE_DATA_CREDITS_PER_MINUTE` | no | `8` | Per-minute credit ceiling, when the vendor does not report one. |
| `TWELVE_DATA_WS` | no | `true` | Whether the app attempts the vendor price WebSocket. |

Until `TWELVE_DATA_API_KEY` is set, every asset renders a "no data source
configured" state and no numbers at all. `/api/futures/status` reports whether
the key is present, which symbol each asset is configured to read, and the current
credit-meter state.

To find the symbol your own plan entitles, run discovery out of band:

```
TWELVE_DATA_API_KEY=... npm run check:symbols
TWELVE_DATA_API_KEY=... npm run check:symbols -- --search gold
```

The first form probes the known alternatives with one small request each and
prints a table of what works; pin the winner with `SYMBOL_*`. The second runs a
`symbol_search`. Neither runs inside a request, so neither can spend credits the
meter did not authorise.

### Error kinds

The app keeps the three failure causes apart, in its own words:

| Cause | What the UI shows | Retried? |
| --- | --- | --- |
| Real vendor rate limit (429 / credit message) | "Rate limit — retrying in Xs" | Yes, once, after the minute resets |
| Symbol / plan not available | "Symbol not available on current plan" | No — never in a loop |
| Our own credit meter blocked the call | "Waiting for credits" | Yes, automatically after the minute resets |
| Anything else | A plain error | No |

The vendor's own error **code and message** are logged on every failed request, so
"what did the vendor actually say?" is answerable from the server log alone.

### API credits

Twelve Data meters credits per minute (8 on the free plan) and answers `429` /
"rate limit" once the minute is spent. One full asset load is **7 credits** — one
request per timeframe — and the server-side meter (`api/_lib/creditMeter.ts`)
enforces the ceiling.

- **One full asset load fits.** The meter allows 7 of 8 credits in a minute, so a
  full load completes in a single minute. There is no cold-start cap: a fresh
  instance may spend the whole minute.
- **Per-timeframe cache with a TTL**, keyed by `(symbol, timeframe)`, with
  in-flight de-duplication. Inside the TTL a timeframe costs nothing; switching
  back to a cached asset costs **0 credits**. Concurrent users share one vendor
  call.
- **Auto-refresh touches only expired timeframes** of the selected asset, one
  request at a time, and never runs when the server meter has one credit or fewer
  left — so a user action always has a credit to spend.
- **A blocked timeframe reads "Waiting for credits"** and resumes automatically
  after the minute resets, while everything already loaded keeps serving.
- **A vendor rate limit stops everything** until the minute resets.

The meter uses the vendor's own `api-credits-used` / `api-credits-left` headers as
the source of truth when present. A blocked fetch is surfaced as
`Rate limit — retrying in Xs` with the last series marked **Stale**; the raw
vendor text is never shown.

`PRICE_POLL_INTERVAL_MS` (30s) is the price refresh when no tick feed is in use.

### Adding another provider

Databento, Polygon, a broker feed and Twelve Data all fit the same shape: they key
on a symbol, accept an interval and a bar count, and return OHLCV. Only the request
and the field names differ.

1. Add a module under `api/_lib/` that turns the provider's response into the
   shared `Candle` shape. Use `api/_lib/twelvedata.ts` as the template: it exports
   `fetchTimeSeries`, normalises the datetime to the app's UTC form, and throws a
   typed error carrying an error *kind*.
2. Add the provider to the `FuturesVendor` union and the switch in
   `api/_lib/futuresShared.ts`, reading its key from a new environment variable.
3. Set `FUTURES_PROVIDER` to the new id.

Keep the key server-side — the browser must never see it. The client provider in
`src/core/providers/futures.ts` only ever calls your own `/api/*` routes.

## Setup

```
npm install && npm run dev   # → http://localhost:8080/
```

Twelve Data needs `TWELVE_DATA_API_KEY`. Locally, the `api/` functions run under
`vercel dev`; `npm run dev` serves the front end only, so the assets will report
no configured source unless you use `vercel dev`.

## Layout

```
src/core/indicators.ts      pure indicator math, no I/O
src/core/votes.ts           per-indicator and per-MA vote logic
src/core/scoring.ts         gauge building, score → label mapping
src/core/structure.ts       swing highs/lows, BOS, CHoCH, premium/discount
src/core/session.ts         session open resolution, VWAP/POC window
src/core/metrics.ts         ATR, VWAP, session range, point of control
src/core/marketHours.ts     is the market still producing bars? (pure)
src/core/candles.ts         bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts one timeframe → three compasses + structure + metrics
src/core/entryCheck.ts      does the market agree with a long/short? (pure)
src/core/feedCache.ts       load order and per-timeframe TTL (pure)
src/core/providers/         MarketDataProvider interface + the Twelve Data provider
src/core/providers/polling.ts   per-timeframe TTL, shared by client and server
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts       every weight, tolerance, TTL and session setting
src/hooks/useInstrumentFeed.ts        all seven timeframes for one asset
src/hooks/useTimeframeReadings.ts     one reading per (asset, timeframe)
api/_lib/creditMeter.ts    the per-minute credit meter that gates every vendor call
api/_lib/symbols.ts         the one place the single symbol per asset is mapped
api/_lib/twelvedata.ts      vendor adapter: meter, request, parse, classify errors
api/_lib/candleCache.ts     short-lived candle cache (one vendor call per TTL)
api/futures/candles.ts      server-side candle proxy
api/futures/status.ts       whether a key is configured, what is read, meter state
api/futures/symbols.ts      symbol discovery, used by `npm run check:symbols`
scripts/checkSymbols.mjs    the discovery CLI
```

## Tests

```
npm test
```

Covers every indicator against hand-computed values, vote thresholds, the score
mapping, label/score-sign consistency, the entry check (including the
higher-timeframe warning and the Loading state), the load order and per-timeframe
TTL, session VWAP reset, market structure, market-open detection, the vendor
adapter (parsing, error classification, the vendor code/message), the credit meter
(limits, vendor-reported usage, rate-limit reset, the seven-credit full load),
symbol mapping (free-plan defaults, env overrides), the single-symbol resolution
and cache behaviour, and the WebSocket frame parser.

## Commands

```
npm run dev            # dev server on :8080
npm run build          # production build
npm test               # unit tests
npm run check:symbols  # which Twelve Data symbols your plan entitles
npm run typecheck      # see the note below
```

For type checking, target the app project explicitly. The root `tsconfig.json` is
solution-style (`files: []`), so `npm run typecheck` / bare `tsc --noEmit` checks
nothing. Vendored `src/components/ui/*` has pre-existing missing-module errors
that predate this work; filter them out:

```
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
npx tsc -p api/tsconfig.json --noEmit     # the serverless functions
```

`npm run lint` passes with 0 errors; its 6 warnings are all `react-refresh` notes
in the vendored `src/components/ui/*`, the same files that carry the pre-existing
type errors above.

## Streaming

Twelve Data serves candles on request — all seven timeframes for the selected
asset, one request at a time — plus a polled price when no tick feed is available.
Because a polled close is not a tick, the status reads "Delayed (polling)" rather
than "Live", and a market that has stopped producing bars is labelled "Market
closed" instead of continuing to present the last reading as current.

When the server exposes a browser-safe price stream the client uses it and the
status can reach `LIVE`; otherwise the price is polled over REST. A dropped socket
triggers capped-backoff reconnect. When the vendor's credit limit blocks a fetch
the header shows "Rate limit — retrying in Xs" and the last series is marked
`Stale`; the retry fires once, after the reset the server reported.
