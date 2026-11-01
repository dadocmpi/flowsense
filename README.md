# FlowSense

Market compass for **Gold futures (GC), S&P 500 futures (ES) and Dow Jones
futures (YM)**.

Every number is either a provider response or arithmetic over one. Where a
figure is not available the app shows an explicit unavailable state — nothing
is simulated, modelled or back-filled.

## The screen

Top to bottom, and it fits 1920x1080 without scrolling:

1. the top bar — price, feed state, provenance, asset tabs, timeframe buttons
2. three compasses in one row — Technical indicators, Summary, Order flow
3. one merged "Technical indicators" table, beside the LONG / SHORT entry check

The timeframe buttons carry the label only — `M1 M5 M15 M30 1H 4H 1D`. No score,
no signal word and no colour that implies a signal; only the selected one is
highlighted, and every button is disabled while a request is in flight. Clicking
one fetches that timeframe's own series and updates the three compasses, the
table and the entry check together.

Readings are keyed `asset:timeframe`, so switching M15 → 1H → M15 never blends
the two series and a timeframe loaded earlier keeps its own reading and age.

There is no multi-timeframe confluence grid, no "Timeframe detail" panel and no
separate "Technical metrics" panel. There is exactly ONE technical table, and it
holds both the moving averages and the oscillators. Nothing is collapsible:
every panel renders expanded on load.

## Instruments

| Instruments | Candle source |
| --- | --- |
| GC, ES, YM | Twelve Data, via a server-side API route (key never reaches the browser) |

## Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, shown as `M1`, `M5`, `M15`, `M30`,
`1H`, `4H`, `1D`. Each timeframe is fetched natively from the provider rather
than aggregated from a single base series, so a 1m seed cannot cap how far back
the daily reaches. Only the timeframe being viewed is fetched on load — one
vendor credit each — and the others load on demand when selected, so a page load
costs one credit, not seven. Each request asks for 300 candles so EMA 200 is
valid; a wider window is still one request and so still one credit. The live
stream carries the 1m bar; the newest bar of the mergeable timeframes (5m
through 1D) is refreshed from that tail, so a higher timeframe moves with the
market between fetches instead of freezing.

A merge is refused when the base window does not reach the bucket open. A 1m
window covers only a few hours, so the current daily bucket is usually only
partly observed; rebuilding it would report a high, low and volume for a day
that has barely started, so the natively fetched bar is kept instead.

## The compass

Three compasses, in one row, for the SELECTED timeframe:

1. **Technical indicators** (left) — one gauge over the moving averages (SMA and
   EMA over 5, 10, 20, 50, 100, 200) AND the oscillators: RSI(14), Stochastic
   (9,6), Stochastic RSI(14), MACD(12,26,9), ADX(14) with +DI/-DI, Williams %R
   (14), CCI(14), Bollinger Bands(20,2), ATR(14) and ATR against its own
   average, VWAP, Highs/Lows(14), Ultimate Oscillator, ROC(12) and Bull/Bear
   Power(13). Every one is computed locally from the candles. Each moving
   average votes Buy above it, Sell below, Neutral inside a tolerance band.
2. **Summary** (centre) — the technical gauge blended with order flow into one
   overall bias, plus last price, change and how old the data is ("updated 42s
   ago"). With no order-flow source configured it IS the technical reading,
   rather than a blend against a stand-in zero.
3. **Order flow** (right) — delta/CVD, order-book imbalance and absorption. That
   data does not exist in a candle feed, so it comes from a provider or the card
   says there is none.

Each card carries its own key numbers, so the figures are read on the compass
itself.

Score to label mapping, applied everywhere and asserted by tests:

| Score | Label |
| --- | --- |
| ≥ +60 | Strong Buy |
| +20 … +59 | Buy |
| −19 … +19 | Neutral |
| −59 … −20 | Sell |
| ≤ −60 | Strong Sell |

The label is always derived from the score's sign, so a positive score can
never read as Sell.

### Weights

All weights live in one file: `src/config/compass.ts`.

- `indicatorWeights` — per-indicator weight inside the oscillator block.
- `maWeights` — per-period weight inside the moving-average block.
- `technicalBlend` — how the MA block and the oscillator block combine into the
  left "Technical indicators" gauge.
- `orderFlowBlend` — how the technical gauge and order flow combine into the
  centre "Summary" gauge. Ignored when no order-flow source is configured.
- `maTolerancePercent` — the Neutral band around each moving average, as a
  percentage of price.
- `thresholds` — the score cut-offs behind the five labels.
- `entryCheck` — the rules behind the LONG / SHORT entry check:
  `compassWeights`, `alignedShare` and `againstShare`.
- `session` — `mode` (`RTH` or `FULL`), `timezone`, and the open times.

## Entry check

The compasses say what the market is doing; the entry check answers whether they
agree with the trade you are about to take. Pick LONG or SHORT and the three
compasses of the SELECTED timeframe are classified as agreeing, disagreeing or
neutral. The verdict is **Aligned**, **Mixed** or **Against**.

Agreement is weighted by `compassWeights` and measured only across compasses
that took a side, so a neutral compass neither helps nor hurts. A compass with
no reading — order flow with no source configured — is reported as unavailable
and excluded, so a missing source can never be mistaken for agreement. The logic
is pure (`src/core/entryCheck.ts`) and covered by
`src/core/__tests__/entryCheck.test.ts`.

Under the verdict, a chip row shows every timeframe's stored summary reading and
how old it is. A chip is filled ONLY from a timeframe already loaded in this
session; the rest read "Not loaded" and are never fetched to fill a chip. That
is what keeps a page load at one timeframe's worth of credits.

## Market structure

Per timeframe, a lightweight Smart Money Concepts read: the last break of
structure (BOS), the last change of character (CHoCH), and whether price sits
in the premium or discount half of the last swing range. Pure function in
`src/core/structure.ts`.

## Data providers

Candles come through a provider abstraction (`MarketDataProvider` in
`src/core/providers/types.ts`):

```ts
getCandles(instrument, timeframe, limit, signal): Promise<Candle[]>
subscribeTicks?(instrument, handlers): StreamHandle   // optional
```

- **Futures / Twelve Data** (`src/core/providers/futures.ts`) — GC/ES/YM,
  proxied through `/api/futures/candles` so the key stays server-side. Candles
  plus a polled price (or a browser-safe stream when the server offers one).

### Twelve Data configuration

Set these in the Vercel project (Settings → Environment Variables) or in a local
`.env.local` (copy `.env.example` as a starting point). They are read **only** by
the serverless functions under `api/`, never by the browser bundle.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TWELVE_DATA_API_KEY` | yes | — | Server-side credential. The only variable you must set. |
| `TWELVE_DATA_WS` | no | `true` | Whether the app attempts the vendor price WebSocket. |
| `TWELVE_DATA_SYMBOL_GC` | no | `GC1!` | The one symbol GC reads. Set it if your plan lacks futures data. |
| `TWELVE_DATA_SYMBOL_ES` | no | `ES1!` | The one symbol ES reads. |
| `TWELVE_DATA_SYMBOL_YM` | no | `YM1!` | The one symbol YM reads. |
| `TWELVE_DATA_CREDITS_PER_MINUTE` | no | `8` | Per-minute credit ceiling, when the vendor does not report one. |
| `FUTURES_ROLL_METHOD` | no | `frontMonth` | How the continuous series is described. |
| `FUTURES_ROLL_ADJUSTMENT` | no | `none` | Adjustment across a roll. |
| `FUTURES_PROVIDER` | no | — | Legacy; setting the key alone selects Twelve Data. |
| `ORDERFLOW_PROVIDER` | no | — | Order-flow vendor id. Anything other than `none` selects a source. |
| `ORDERFLOW_API_KEY` | no | — | The order-flow vendor's key, read only by `api/`. |

Until `TWELVE_DATA_API_KEY` is set, futures instruments render a "no data source
configured" state and no numbers at all. `/api/futures/status` reports whether
the key is present, which symbol each instrument is configured to read, and the
current credit-meter state.

### Which symbol gets used

Twelve Data entitlement varies by plan, but the app does **not** probe for it at
runtime. Each instrument has exactly ONE configured symbol in
`api/_lib/symbols.ts`, and a symbol that fails returns an error for that asset
instead of spending more credits on another attempt:

| Instrument | Default symbol | Kind |
| --- | --- | --- |
| GC | `GC1!` Gold futures | futures |
| ES | `ES1!` E-mini S&P 500 | futures |
| YM | `YM1!` E-mini Dow | futures |

A runtime walk used to try `GC1!` → `XAU/USD` → `GLD` and remember the first that
worked, which cost one credit per candidate: on a plan without futures data a
single page load could spend three credits per timeframe before it found a proxy.
The symbol is now a configuration fact. **A proxy is always labelled a proxy** —
in the header and in the page footer — and never presented as the futures
contract.

To find the symbol your own plan entitles, run discovery out of band:

```
TWELVE_DATA_API_KEY=... npm run check:symbols
TWELVE_DATA_API_KEY=... npm run check:symbols -- --search gold
```

The first form probes the known alternatives with one small request each and
prints a table of what works; pin the winner with `TWELVE_DATA_SYMBOL_GC` etc.
The second runs a `symbol_search`. Neither runs inside a request, so neither can
spend credits the meter did not authorise.

### API credits

Twelve Data meters credits per minute (8 on the Basic plan) and answers
`429`/`rate limit` once the minute is spent. Three levers keep the spend down,
and a server-side meter (`api/_lib/creditMeter.ts`) enforces them:

- **One timeframe per load.** The page fetches only the timeframe the user is
  looking at, not all eight. Selecting another fetches that one on demand; a
  timeframe already loaded is served from memory for free. A full load of the
  default timeframe is therefore **one credit per asset — three for GC + ES +
  YM**.
- **One request per `(symbol, timeframe)` per TTL.** The server caches each
  payload just under its poll interval, so concurrent users share one vendor
  call, and the price poll is served as a slice of the payload a bigger request
  already paid for.
- **A meter that stops before the ceiling.** Every vendor call is checked
  against the minute limit before it is made and recorded after it, using the
  vendor's own `api-credits-used` / `api-credits-left` headers as the source of
  truth when present. On a rate-limit response the meter adopts the reported
  usage, marks itself exhausted for the rest of the minute, and refuses every
  further call until it resets.

A cold serverless instance starts with an empty meter, so it is capped at
**3 credits in its first 60 seconds** — one timeframe load, not a full sweep —
until it has proven the vendor is healthy. A blocked fetch is surfaced as
`Rate limit — retrying in Xs` with the last series marked **Stale**, and retried
exactly once after the reset. The raw vendor text is never shown.

`PRICE_POLL_INTERVAL_MS` (30s) is the price refresh when no tick feed is in use.

### Continuous contracts and the roll

The provider asks for the *continuous* symbol (`GC1!`, `ES1!`, `YM1!`), not a
specific contract, and the roll is handled upstream. That is deliberate: rolling
correctly needs the exchange calendar and open interest, which a chart client
cannot reconstruct from candles alone. `FUTURES_ROLL_METHOD` selects between
following the front month (a price jump at each roll) and a back-adjusted series
(returns preserved, pre-roll levels shifted). If your plan does not carry the
continuous contract, the fallback proxies are spot or ETF series and carry no
roll at all — the UI labels them accordingly.

### Order flow is a separate provider

The right-hand compass reads order flow: delta/CVD, order-book imbalance and
absorption. Twelve Data carries **no** order-flow data — a candle has no
aggressor side and no order book — so it is never derived from the candle feed.

The shipped adapter is `none`: the card reads "No order flow source configured"
and draws **no gauge**. It never draws a neutral needle or a `0` in place of a
missing reading, because a neutral needle looks like a real "neutral market"
read. With no source, the Summary compass IS the technical reading rather than a
blend against a stand-in zero.

To connect a vendor, implement `fetchOrderFlowReading` in **`api/_lib/orderflow.ts`**
— the one file to edit — and set `ORDERFLOW_PROVIDER` and `ORDERFLOW_API_KEY`.
Nothing else changes: the client (`src/core/providers/orderflow.ts`), the summary
blend and the entry check already speak that shape. The key stays server-side.

### Adding another provider

Databento, Polygon, a broker feed and Twelve Data all fit the same shape: they
key on a symbol, accept an interval and a bar count, and return OHLCV. Only the
request and the field names differ.

1. Add a module under `api/_lib/` that turns the provider's response into the
   shared `Candle` shape. Use `api/_lib/twelvedata.ts` as the template: it
   exports `fetchTimeSeries`, normalises the datetime to the app's UTC form, and
   throws a typed error carrying an error *kind*.
2. Add the provider to the `FuturesVendor` union and the switch in
   `api/_lib/futuresShared.ts`, reading its key from a new environment variable.
3. Set `FUTURES_PROVIDER` to the new id.

Keep the key server-side — the browser must never see it. The client provider in
`src/core/providers/futures.ts` only ever calls your own `/api/*` routes.

## Setup

```
npm install && npm run dev   # → http://localhost:8080/
```

Futures need `TWELVE_DATA_API_KEY`. Locally, the `api/` functions run under
`vercel dev`; `npm run dev` serves the front end only, so the futures tabs will
report no configured source unless you use `vercel dev`.

## Layout

```
src/core/indicators.ts      pure indicator math, no I/O
src/core/votes.ts           per-indicator and per-MA vote logic
src/core/scoring.ts         gauge building, score → label mapping, blends
src/core/structure.ts       swing highs/lows, BOS, CHoCH, premium/discount
src/core/session.ts         session open resolution, VWAP/POC window
src/core/metrics.ts         ATR, VWAP, session range, point of control
src/core/marketHours.ts     is the market still producing bars? (pure)
src/core/candles.ts         bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts one timeframe → three compasses + structure + metrics
src/core/entryCheck.ts      do the selected timeframe's compasses agree? (pure)
src/core/providers/         MarketDataProvider interface + the futures provider
src/core/providers/orderflow.ts     OrderFlowProvider interface + the `none` adapter
src/core/providers/polling.ts   poll cadence and server cache TTLs
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts       every weight, tolerance and session setting
src/hooks/useInstrumentFeed.ts        candles and ticks for one instrument
src/hooks/useTimeframeReadings.ts     one reading per (asset, timeframe), kept apart
api/_lib/creditMeter.ts    the per-minute credit meter that gates every vendor call
api/_lib/symbols.ts         the one place the single symbol per instrument is mapped
api/_lib/twelvedata.ts      vendor adapter: meter, request, parse, classify errors
api/_lib/candleCache.ts     short-lived candle cache (one vendor call per TTL)
api/_lib/orderflow.ts       THE file to edit to connect an order-flow vendor
api/futures/candles.ts      server-side futures candle proxy
api/futures/status.ts       whether a key is configured, what is read, and meter state
api/futures/symbols.ts      symbol discovery, used by `npm run check:symbols`
api/orderflow/reading.ts    whether an order-flow source is configured, and its reading
scripts/checkSymbols.mjs    the discovery CLI
```

## Tests

```
npm test
```

Covers every indicator against hand-computed values, vote thresholds, the score
mapping, label/score-sign consistency, the per-timeframe engine, the entry check,
session VWAP reset, live-tail merging, market structure, market-open detection,
the poll cadence, the vendor adapter (parsing, error classification), the credit
meter (limits, cold start, vendor-reported usage, rate-limit reset), symbol
mapping, the single-symbol resolution and cache behaviour, the order-flow
provider seam, and the WebSocket frame parser.

## Commands

```
npm run dev            # dev server on :8080
npm run build          # production build
npm test               # unit tests
npm run check:symbols  # which Twelve Data symbols your plan entitles
npm run typecheck      # see the note below
```

`npm run check:symbols` needs `TWELVE_DATA_API_KEY` in the environment or in a
`.env` / `.env.local` file. Add `-- --search <phrase>` to list what the vendor
offers for a phrase.

For type checking, target the app project explicitly. The root `tsconfig.json`
is solution-style (`files: []`), so `npm run typecheck` / bare `tsc --noEmit`
checks nothing. Vendored `src/components/ui/*` has pre-existing missing-module
errors that predate this work; filter them out:

```
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
npx tsc -p api/tsconfig.json --noEmit     # the serverless functions
```

`npm run lint` passes with 0 errors; its 6 warnings are all `react-refresh`
notes in the vendored `src/components/ui/*`, the same files that carry the
pre-existing type errors above.

## Streaming

A futures provider serves candles on request — one timeframe per load, the one
being viewed — plus a polled price when no tick feed is available. Because a
polled close is not a tick, the status reads "Delayed (polling)" rather than
"Live", and a market that has stopped producing bars is labelled "Market
closed" instead of continuing to present the last reading as current.

When the server exposes a browser-safe price stream, the client uses it and the
status can reach `LIVE`; otherwise the price is polled over REST. A dropped
socket triggers capped-backoff reconnect, and the UI shows a reconnecting
banner instead of presenting stale data as live. When the credit meter blocks a
fetch, the header shows "Rate limit — retrying in Xs" and the last series is
marked `Stale`; the retry fires once, after the reset the server reported.
