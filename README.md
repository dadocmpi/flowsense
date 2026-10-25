# FlowSense

Multi-timeframe market compass. **Gold futures (GC), S&P 500 futures (ES) and
Dow Jones futures (YM) are the default instruments**; Binance USDT spot pairs
remain available as a secondary group.

Every number is either a provider response or arithmetic over one. Where a
figure is not available the app shows an explicit unavailable state — nothing
is simulated, modelled or back-filled.

## Instrument groups

| Group | Instruments | Candle source | Order flow |
| --- | --- | --- | --- |
| Futures (default) | GC, ES, YM | Twelve Data, via a server-side API route (key never reaches the browser) | Not available — hidden with an explanation |
| Crypto | BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, LTC | Binance public REST + WebSocket | Real: book depth, trade tape, aggressor split |

## Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, shown as `M1`, `M5`, `M15`,
`M30`, `1H`, `4H`, `1D`, `1W`. Each timeframe is fetched natively from the
provider rather than aggregated from a single base series, so a 1m seed cannot
cap how far back the weekly reaches. The live stream carries the 1m bar; the
newest bar of the mergeable timeframes (5m through 1D) is refreshed from that
tail, so a higher timeframe moves with the market between fetches instead of
freezing.

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

ATR(14), VWAP, session high/low and the volume point of control. For an
instrument with a session (`SESSION`), VWAP, the range and the POC reset at the
session open — `RTH` or `FULL`, selected in config. Crypto trades continuously
and has no open to reset at, so its window is the fetched series and the panel
labels it as a window rather than a session.

## Data providers

Candles come through a provider abstraction (`MarketDataProvider` in
`src/core/providers/types.ts`):

```ts
getCandles(instrument, timeframe, limit, signal): Promise<Candle[]>
subscribeTicks(instrument, handlers): StreamHandle
subscribeOrderFlow?(instrument, handlers): StreamHandle   // optional
```

- **Binance** (`src/core/providers/binance.ts`) — crypto, browser-direct, no
  key. Implements both ticks and order flow.
- **Futures / Twelve Data** (`src/core/providers/futures.ts`) — GC/ES/YM,
  proxied through `/api/futures/candles` so the key stays server-side. Candles
  plus a polled price; order flow is not offered and the panel says so rather
  than estimating.

### Twelve Data configuration

Set these in the Vercel project (Settings → Environment Variables) or in a local
`.env.local` (copy `.env.example` as a starting point). They are read **only** by
the serverless functions under `api/`, never by the browser bundle.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TWELVE_DATA_API_KEY` | yes | — | Server-side credential. The only variable you must set. |
| `TWELVE_DATA_WS` | no | `true` | Whether the app attempts the vendor price WebSocket. |
| `TWELVE_DATA_SYMBOL_GC` | no | — | Pin GC to one symbol, skipping the candidate walk. |
| `TWELVE_DATA_SYMBOL_ES` | no | — | Pin ES to one symbol. |
| `TWELVE_DATA_SYMBOL_YM` | no | — | Pin YM to one symbol. |
| `FUTURES_ROLL_METHOD` | no | `frontMonth` | How the continuous series is described. |
| `FUTURES_ROLL_ADJUSTMENT` | no | `none` | Adjustment across a roll. |
| `FUTURES_PROVIDER` | no | — | Legacy; setting the key alone selects Twelve Data. |

Until `TWELVE_DATA_API_KEY` is set, futures instruments render a "no data source
configured" state and no numbers at all. `/api/futures/status` reports whether
the key is present and which symbol is resolved for each instrument.

### Which symbol gets used

Twelve Data entitlement varies by plan, so nothing is hard-coded. Each
instrument carries an ordered candidate list in `api/_lib/symbols.ts`:

| Instrument | 1st choice (futures) | 2nd (proxy) | 3rd (proxy) |
| --- | --- | --- | --- |
| GC | `GC1!` Gold futures | `XAU/USD` Gold spot | `GLD` ETF |
| ES | `ES1!` E-mini S&P 500 | `SPX` index | `SPY` ETF |
| YM | `YM1!` E-mini Dow | `DJI` index | `DIA` ETF |

The server walks the list, uses the first symbol that returns candles, and
remembers it. **A proxy is always labelled a proxy** — in the header and in the
page footer — and never presented as the futures contract.

To see what your own plan entitles:

```
TWELVE_DATA_API_KEY=... npm run check:symbols
TWELVE_DATA_API_KEY=... npm run check:symbols -- --search gold
```

The first form probes every candidate with one small request and prints a
table of what works. The second runs a `symbol_search`, which is how you find a
replacement when every candidate fails; pin it with `TWELVE_DATA_SYMBOL_GC` etc.

### API credits

Every indicator is computed locally from candles, so a refresh costs **one**
request per symbol and timeframe — never one per indicator. Two more levers
keep the spend down:

- The client polls each timeframe at a fraction of its own bar length
  (`POLL_INTERVAL_MS` in `src/core/providers/polling.ts`).
- The server caches each `(symbol, timeframe)` payload just under that interval
  (`SERVER_CACHE_TTL_MS`), so concurrent users share one vendor call.

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

Crypto needs no key, no `.env` and no server-side component. Futures needs
`TWELVE_DATA_API_KEY`. Locally, the `api/` functions run under `vercel dev`;
`npm run dev` serves the front end only, so the futures tabs will report no
configured source unless you use `vercel dev`.

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
src/core/providers/         MarketDataProvider interface + Binance and futures
src/core/providers/polling.ts   poll cadence and server cache TTLs
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts       every weight, tolerance and session setting
src/hooks/useInstrumentFeed.ts        candles, ticks, order flow for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the engine and publishes history
api/_lib/symbols.ts         the one place symbols are mapped and candidates ordered
api/_lib/twelvedata.ts      vendor adapter: request, parse, classify errors
api/_lib/candleCache.ts     symbol resolution + short-lived candle cache
api/futures/candles.ts      server-side futures candle proxy
api/futures/status.ts       whether a key is configured, and what is resolved
api/futures/symbols.ts      symbol discovery, used by `npm run check:symbols`
scripts/checkSymbols.mjs    the discovery CLI
```

## Tests

```
npm test
```

Covers every indicator against hand-computed values, vote thresholds, the score
mapping, label/score-sign consistency, MTF confluence, the entry check
(including the higher-timeframe warning), session VWAP reset, continuous-market
windows, history ordering and dedupe, order-flow aggregation, market structure,
market-open detection, the poll cadence, the vendor adapter (parsing, error
classification), symbol resolution and fallback, and the WebSocket frame parser.

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

The crypto feed seeds candle history with REST calls, then one combined
WebSocket drives everything live: `@ticker`, `@kline_5m`, `@depth10@100ms` and
`@aggTrade`. High-frequency messages accumulate in refs and one coalesced
snapshot commits to React state every 150 ms, so the compass, the price and the
order flow all move within a second or two of market activity without a
re-render per trade. A dropped socket triggers capped-backoff reconnect, and on
the next `LIVE` the hook re-seeds klines to refill the series; the UI shows a
reconnecting banner instead of presenting stale data as live.

Binance runs several regional domains and blocks some of them from some
locations (HTTP 451). The client tries the official hosts in order —
`data-api.binance.vision`, `api.binance.com`, `api.binance.us` — and remembers
whichever answers, so a geo-block on one domain is not fatal. If every host is
blocked the app shows a `GEO_BLOCKED` error instead of inventing data.

A futures provider serves candles on request, refreshed on a cadence tied to
the timeframe, plus a polled price when no tick feed is available. Because a
polled close is not a tick, the status reads "Delayed (polling)" rather than
"Live", and a market that has stopped producing bars is labelled "Market
closed" instead of continuing to present the last reading as current.
