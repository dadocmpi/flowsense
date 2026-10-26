# FlowSense

A single-screen, multi-timeframe market compass. **Gold futures (GC), S&P 500
futures (ES) and Dow Jones futures (YM) are the instruments**, sourced from
Twelve Data through a server-side route so the API key never reaches the
browser. Gold is the default.

Every number is either a provider response or arithmetic over one. Where a
figure is not available the app shows an explicit unavailable state — nothing
is simulated, modelled or back-filled.

## The screen

One 1920x1080 view, no scrolling. Dark theme, large type.

- **Top bar** — brand; asset buttons (GOLD, S&P 500, DOW JONES); timeframe
  buttons (M1, M5, M15, M30, 1H, 4H, 1D, default M15) that drive the main
  compass; on the right the live price, daily change, a status dot
  (live / delayed / closed) and the last update time.
- **Left** — the one and only list of all seven timeframes. Each row shows the
  timeframe, its colour-coded label and its score; clicking a row selects it
  for the compass. A single line at the bottom gives the overall bias, e.g.
  "Overall bias: Sell, 5 of 7 aligned".
- **Centre** — one large compass (gauge with needle) for the selected asset and
  timeframe, with the big label and the score from −100 to +100.
- **Right** — the entry check (below).
- **Bottom** — one small line with the data source, the symbol actually used
  (and "proxy" when it is not the futures contract) and the last update time.

Timeframes appear in exactly one place: the left list.

## Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, shown as `M1`, `M5`, `M15`, `M30`,
`1H`, `4H`, `1D`. There is no weekly.

Each timeframe is fetched from the provider at its own interval, not aggregated
from one base series, so a 1m seed cannot cap how far back the higher
timeframes reach. A timeframe with too few candles to warm up its indicators is
reported as unavailable and does not vote. It is never back-filled.

## The compass

For each timeframe the compass is a weighted vote across a fixed set of factors.
Two blocks are combined into a score from −100 to +100:

1. **Moving averages** — SMA and EMA over 5, 10, 20, 50, 100, 200. Each votes
   Buy above the average, Sell below, Neutral inside a tolerance band.
2. **Technical indicators** — RSI(14), Stochastic(9,6), Stochastic RSI(14),
   MACD(12,26,9), ADX(14) with +DI/-DI, Williams %R(14), CCI(14), ATR(14),
   Highs/Lows(14), Ultimate Oscillator, ROC and Bull/Bear Power(13), each with a
   standard threshold vote.

Only the blended summary is displayed; the individual votes exist inside the
scoring logic.

Score to label mapping, applied everywhere and asserted by tests:

| Score | Label |
| --- | --- |
| ≥ +60 | Strong Buy |
| +20 … +59 | Buy |
| −19 … +19 | Neutral |
| −59 … −20 | Sell |
| ≤ −60 | Strong Sell |

The label is always derived from the score through `labelFromScore`, so a
positive score can never read as Sell.

### Weights

All weights live in one file: `src/config/compass.ts`.

- `indicatorWeights` — per-indicator weight inside the indicator block.
- `maWeights` — per-period weight inside the moving-average block.
- `gaugeBlend` — how the MA block and the indicator block combine.
- `timeframeWeights` — how much each timeframe counts in the overall bias. The
  trend timeframes (1H, 4H, 1D) carry the most weight; M1 and M5 are light.
- `maTolerancePercent` — the Neutral band around each moving average.
- `thresholds` — the score cut-offs behind the five labels.
- `entryCheck` — the rules behind the LONG / SHORT entry check.

| Timeframe | Default weight |
| --- | --- |
| M1 | 0.2 |
| M5 | 0.6 |
| M15 | 1.0 |
| M30 | 1.2 |
| 1H | 1.6 |
| 4H | 1.8 |
| 1D | 2.0 |

## Entry check

The compass says what the market is doing; the entry check answers whether it
agrees with the trade you are about to take.

Pick LONG or SHORT (the last choice is remembered). The verdict is one word:

| Verdict | Meaning |
| --- | --- |
| ALIGNED | At least `minAligned` (5 of 7) timeframes agree and no higher timeframe disagrees |
| AGAINST | At most `maxAlignedForAgainst` (3) agree, or most higher timeframes disagree |
| PARTIAL | Anything in between |

Under the verdict the panel shows the count ("5 of 7 timeframes aligned") and
then only the timeframes that disagree, as small tags. A neutral timeframe
counts as not agreeing but is never shown as disagreeing. When 1H or higher
disagrees, one short warning line appears. Nothing else is shown.

The rules live in the `entryCheck` block of `src/config/compass.ts`
(`higherTimeframes`, `minAligned`, `maxAlignedForAgainst`,
`warnOnHigherTimeframeDisagreement`). The logic is `checkEntry` in
`src/core/entryCheck.ts`, pure and covered by
`src/core/__tests__/entryCheck.test.ts`.

## Data provider

Candles come through a provider abstraction (`MarketDataProvider` in
`src/core/providers/types.ts`). Futures are the only source:

- **Futures / Twelve Data** (`src/core/providers/futures.ts`) — GC/ES/YM,
  proxied through `/api/futures/candles` so the key stays server-side. Candles
  plus a polled price. Because a polled close is not a tick, the status reads
  "Delayed", never "Live".

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

Until `TWELVE_DATA_API_KEY` is set, the instruments render a "no data source
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
remembers it. **A proxy is always labelled a proxy** — in the footer — and never
presented as the futures contract.

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

`npm run dev` serves the front end only, so the futures instruments report no
configured source unless you also run the `api/` functions (under `vercel dev`)
or point the app at a harness that serves `/api/futures/*`.

## Layout

```
src/core/indicators.ts      pure indicator math, no I/O
src/core/votes.ts           per-indicator and per-MA vote logic
src/core/scoring.ts         gauge building, score → label mapping, overall bias
src/core/marketHours.ts     is the market still producing bars? (pure)
src/core/candles.ts         bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts one timeframe → gauges + blended summary
src/core/multiTimeframe.ts  every timeframe + the overall bias
src/core/entryCheck.ts      does the market agree with a long/short? (pure)
src/core/providers/         MarketDataProvider interface + futures provider
src/core/providers/polling.ts       poll cadence and server cache TTLs
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/config/compass.ts       every weight, tolerance and entry-check rule
src/hooks/useInstrumentFeed.ts        candles and ticks for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the multi-timeframe engine
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
mapping, label/score-sign consistency, multi-timeframe bias, the entry check
(including the higher-timeframe warning), market-open detection, the poll
cadence, the vendor adapter (parsing, error classification), symbol resolution
and fallback, and the WebSocket frame parser.

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
