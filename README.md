# FlowSense

Multi-timeframe market compass. **Gold (GC), S&P 500 (ES), Dow Jones (YM) and
Nasdaq (NQ)** are the instruments this app ships.

Every number is either a provider response or arithmetic over one. Where a
figure is not available the app shows an explicit unavailable state — nothing
is simulated, modelled or back-filled.

## Instruments

| Instruments | Candle source |
| --- | --- |
| GC, ES, YM, NQ | Twelve Data, via a server-side API route (key never reaches the browser) |

By default each instrument reads a spot / ETF **proxy** — Gold `XAU/USD`, S&P 500
`SPY`, Dow `DIA`, Nasdaq `QQQ` — because Twelve Data does not entitle the
continuous-futures contracts (`GC1!`, `ES1!`, `YM1!`, `NQ1!`) on every plan; an
unentitled contract answers "symbol or figi parameter is missing or invalid". A
proxy is always labelled a proxy, never presented as the futures contract.

## Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, shown as `M1`, `M5`, `M15`,
`M30`, `1H`, `4H`, `1D`, `1W`. Each timeframe is fetched natively from the
provider rather than aggregated from a single base series, so a 1m seed cannot
cap how far back the weekly reaches. Only the timeframe being viewed is fetched
on load — one vendor credit each — and the others load on demand when selected,
so a page load costs one credit per asset, not eight. The live stream carries
the 1m bar; the newest bar of the mergeable timeframes (5m through 1D) is
refreshed from that tail, so a higher timeframe moves with the market between
fetches instead of freezing.

A merge is refused when the base window does not reach the bucket open. A 1m
window covers only a few hours, so the current daily bucket is usually only
partly observed; rebuilding it would report a high, low and volume for a day
that has barely started, so the natively fetched bar is kept instead. Weekly
bars are never merged, because the epoch-based bucket boundary is not the
exchange's Monday open.

## The compass

Three gauges per timeframe, in the style of a technical summary:

1. **Moving averages** — SMA and EMA over 5, 10, 20, 50, 100, 200. Each votes
   Buy above the average, Sell below, Neutral inside a tolerance band.
2. **Technical indicators** — RSI(14), Stochastic(9,6), Stochastic RSI(14),
   MACD(12,26,9), ADX(14) with +DI/-DI, Williams %R(14), CCI(14), ATR(14),
   Highs/Lows(14), Ultimate Oscillator, ROC and Bull/Bear Power(13), each with a
   standard threshold vote.
3. **Summary** — the two blocks combined into a score from −100 to +100.

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

- `indicatorWeights` — per-indicator weight inside the indicator gauge.
- `maWeights` — per-period weight inside the moving-average gauge.
- `gaugeBlend` — how the MA block and the indicator block combine into the
  summary.
- `timeframeWeights` — how much each timeframe counts in the confluence bias
  and in the entry check. The trend timeframes (1H, 4H, 1D) carry the most
  weight by default; M1 and M5 are deliberately light and the weekly is a slow
  confirmation.
- `maTolerancePercent` — the Neutral band around each moving average, as a
  percentage of price.
- `thresholds` — the score cut-offs behind the five labels.
- `entryCheck` — the rules behind the LONG / SHORT entry check:
  `higherTimeframes`, `warnOnHigherTimeframeDisagreement`, `alignedShare` and
  `againstShare`.
- `session` — `mode` (`RTH` or `FULL`), `timezone`, and the open times.

| Timeframe | Default weight |
| --- | --- |
| M1 | 0.2 |
| M5 | 0.6 |
| M15 | 1.0 |
| M30 | 1.2 |
| 1H | 1.6 |
| 4H | 1.8 |
| 1D | 2.0 |
| 1W | 1.2 |

## Entry check

The confluence matrix says what the market is doing; the entry check answers
whether it agrees with the trade you are about to take. Pick LONG or SHORT and
every timeframe is classified as agreeing, disagreeing or neutral. The verdict
is **Aligned**, **Partial** or **Against**.

Agreement is weighted by `timeframeWeights` and measured only across timeframes
that took a side, so a neutral timeframe neither helps nor hurts. A single
higher-timeframe disagreement (1H and above by default) stops the verdict being
Aligned and raises an explicit warning — the case worth knowing about before
entering. The logic is pure (`src/core/entryCheck.ts`) and covered by
`src/core/__tests__/entryCheck.test.ts`.

## Confluence matrix

A compact row shows every timeframe's reading at once, plus a confluence
bias: how many timeframes agree, in which direction, and a weighted score. A
timeframe with no data is reported as unavailable and does not vote.

## Market structure

Per timeframe, a lightweight Smart Money Concepts read: the last break of
structure (BOS), the last change of character (CHoCH), and whether price sits
in the premium or discount half of the last swing range. Pure function in
`src/core/structure.ts`.

## Technical metrics

ATR(14), VWAP, session high/low and the volume point of control. VWAP, the
range and the POC reset at the session open — `RTH` or `FULL`, selected in
config.

## Data providers

Candles come through a provider abstraction (`MarketDataProvider` in
`src/core/providers/types.ts`):

```ts
getCandles(instrument, timeframe, limit, signal): Promise<Candle[]>
subscribeTicks?(instrument, handlers): StreamHandle   // optional
```

- **Futures / Twelve Data** (`src/core/providers/futures.ts`) — GC/ES/YM/NQ,
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
| `SYMBOL_GOLD` | no | `XAU/USD` | The one symbol GC reads (Gold spot proxy). |
| `SYMBOL_SP500` | no | `SPY` | The one symbol ES reads (S&P 500 ETF proxy). |
| `SYMBOL_DOW` | no | `DIA` | The one symbol YM reads (Dow ETF proxy). |
| `SYMBOL_NASDAQ` | no | `QQQ` | The one symbol NQ reads (Nasdaq-100 ETF proxy). |
| `TWELVE_DATA_CREDITS_PER_MINUTE` | no | `8` | Per-minute credit ceiling, when the vendor does not report one. |
| `TWELVE_DATA_DAILY_CAP` | no | `800` | Daily credit ceiling; `0` disables the daily cap. Warns at 80%, blocks at 100%. |
| `LIVE_POLL_INTERVAL_MS` | no | `60000` | How often the Summary price and the M1 reading are refreshed. |
| `NEWS_PROVIDER` | no | — | `fmp` or `finnhub` selects the news source; unset shows "No news source configured". |
| `NEWS_API_KEY` | no | — | The news vendor's server-side key. Never reaches the browser. |
| `FUTURES_ROLL_METHOD` | no | `frontMonth` | How the continuous series is described. |
| `FUTURES_ROLL_ADJUSTMENT` | no | `none` | Adjustment across a roll. |
| `FUTURES_PROVIDER` | no | — | Legacy; setting the key alone selects Twelve Data. |

The symbol defaults and the environment-variable names both live in the one
config file `src/config/symbols.ts`; `api/_lib/symbols.ts` reads the override.

Until `TWELVE_DATA_API_KEY` is set, the instruments render a "no data source
configured" state and no numbers at all. `/api/futures/status` reports whether
the key is present, which symbol each instrument is configured to read, and the
current credit-meter state.

### Which symbol gets used

Twelve Data entitlement varies by plan, but the app does **not** probe for it at
runtime. Each instrument has exactly ONE configured symbol in
`src/config/symbols.ts`, and a symbol that fails returns an error for that asset
instead of spending more credits on another attempt. The shipped defaults are
proxies, because the continuous-futures contracts are not entitled on every plan:

| Instrument | Default symbol | Kind |
| --- | --- | --- |
| GC | `XAU/USD` Gold spot | proxy |
| ES | `SPY` SPDR S&P 500 ETF | proxy |
| YM | `DIA` SPDR Dow Jones ETF | proxy |
| NQ | `QQQ` Invesco QQQ Trust (Nasdaq-100) | proxy |

The symbol is a single configuration fact, and no code path builds it from
another source: the client learns what was requested from the candles/status
response. **A proxy is always labelled a proxy** — in the header and in the page
footer — and never presented as the futures contract.

To find the symbol your own plan entitles, run discovery out of band:

```
TWELVE_DATA_API_KEY=... npm run check:symbols
TWELVE_DATA_API_KEY=... npm run check:symbols -- --search gold
```

The first form probes the known alternatives with one small request each and
prints a table of what works; pin the winner with `SYMBOL_GOLD` etc. The second
runs a `symbol_search`. Neither runs inside a request, so neither can spend
credits the meter did not authorise.

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

The shipped defaults are spot / ETF proxies, so there is no roll: `XAU/USD`,
`SPY`, `DIA` and `QQQ` are single continuous series with no contract to roll.
If you pin a real contract instead — a continuous symbol such as `GC1!` or a
dated one — the provider asks for it directly and the roll is handled upstream.
That is deliberate: rolling correctly needs the exchange calendar and open
interest, which a chart client cannot reconstruct from candles alone.
`FUTURES_ROLL_METHOD` then selects between following the front month (a price
jump at each roll) and a back-adjusted series (returns preserved, pre-roll levels
shifted). A proxy carries no roll at all, and the UI labels it accordingly.

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
src/core/scoring.ts         gauge building, score → label mapping, confluence
src/core/structure.ts       swing highs/lows, BOS, CHoCH, premium/discount
src/core/session.ts         session open resolution, VWAP/POC window
src/core/metrics.ts         ATR, VWAP, session range, point of control
src/core/marketHours.ts     is the market still producing bars? (pure)
src/core/candles.ts         bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts one timeframe → three gauges + structure + metrics
src/core/multiTimeframe.ts  every timeframe + the confluence bias
src/core/entryCheck.ts      does the market agree with a long/short? (pure)
src/core/providers/         MarketDataProvider interface + the futures provider
src/core/providers/polling.ts   poll cadence and server cache TTLs
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts       every weight, tolerance and session setting
src/hooks/useInstrumentFeed.ts        candles and ticks for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the multi-timeframe engine
api/_lib/creditMeter.ts    the per-minute credit meter that gates every vendor call
api/_lib/symbols.ts         the one place the single symbol per instrument is mapped
api/_lib/twelvedata.ts      vendor adapter: meter, request, parse, classify errors
api/_lib/candleCache.ts     short-lived candle cache (one vendor call per TTL)
api/futures/candles.ts      server-side futures candle proxy
api/futures/status.ts       whether a key is configured, what is read, and meter state
api/futures/symbols.ts      symbol discovery, used by `npm run check:symbols`
scripts/checkSymbols.mjs    the discovery CLI
```

## Tests

```
npm test
```

Covers every indicator against hand-computed values, vote thresholds, the score
mapping, label/score-sign consistency, MTF confluence, the entry check
(including the higher-timeframe warning), session VWAP reset, history ordering
and dedupe, market structure, market-open detection, the poll cadence, the
vendor adapter (parsing, error classification), the credit meter (limits,
cold start, vendor-reported usage, rate-limit reset), symbol mapping, the
single-symbol resolution and cache behaviour, and the WebSocket frame parser.

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
