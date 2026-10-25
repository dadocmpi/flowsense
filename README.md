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
| Futures (default) | GC, ES, YM | Configured futures provider, via a server-side API route | Not available — hidden with an explanation |
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

## Signal history

Stored per instrument and per timeframe, newest first, with the date and time
on every row. Records written by earlier versions are re-labelled from their
score when loaded, so a row saved with an inconsistent label is healed on read.
Two readings closer than the dedupe window on the same series are treated as
one publish, which stops a reconnect or a tab resume from double-recording.

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
- **Futures** (`src/core/providers/futures.ts`) — GC/ES/YM, proxied through
  `/api/futures/candles` so the key stays server-side. Candles only; order flow
  is not offered and the panel says so rather than estimating.

### Futures configuration

Set these in the Vercel project (Settings → Environment Variables) or in a local
`.env.local`. They are read **only** by the serverless functions under `api/`,
never by the browser bundle.

| Variable | Required | Values | Purpose |
| --- | --- | --- | --- |
| `FUTURES_PROVIDER` | yes | `twelvedata` | Which upstream to use |
| `FUTURES_API_KEY` | yes | provider key | Server-side credential |
| `FUTURES_ROLL_METHOD` | no | `frontMonth` (default), `backAdjusted` | Continuous-contract assembly |
| `FUTURES_ROLL_ADJUSTMENT` | no | `none` (default), `ratio`, `difference` | Adjustment across a roll |

Until `FUTURES_PROVIDER` and `FUTURES_API_KEY` are both set, futures
instruments render a "no data source configured" state and no numbers at all.
The status endpoint `/api/futures/status` reports which providers are
configured.

**Twelve Data is the working implementation** because it needs nothing beyond an
API key: no account provisioning, no contract symbols to maintain, and it
already serves continuous front-month series for GC, ES and YM. Its free tier
covers this app's request volume.

### Continuous contracts and the roll

The provider is asked for the *continuous* symbol (`GC1!`, `ES1!`, `YM1!`), not
a specific contract, and the roll is handled upstream. That is deliberate:
rolling correctly needs the exchange calendar and open interest, which a chart
client cannot reconstruct from candles alone. `FUTURES_ROLL_METHOD` selects
between following the front month (a price jump at each roll) and a
back-adjusted series (returns preserved, pre-roll levels shifted).

### Adding another provider

1. Add a module under `api/_lib/` that turns the provider's response into the
   shared candle shape (see `api/_lib/twelvedata.ts` for the contract).
2. Register it in the provider switch in `api/_lib/futuresShared.ts`.
3. Set `FUTURES_PROVIDER` to the new id.

Databento, Polygon and broker feeds all fit the same shape: they key on a
continuous symbol, accept an interval and a bar count, and return OHLCV. Only
the request and the field names differ. Keep the key server-side — the browser
must never see it.

## Setup

```
npm install && npm run dev   # → http://localhost:8080/
```

Crypto needs no key, no `.env` and no server-side component. Futures needs the
four variables above.

## Layout

```
src/core/indicators.ts      pure indicator math, no I/O
src/core/votes.ts           per-indicator and per-MA vote logic
src/core/scoring.ts         gauge building, score → label mapping, confluence
src/core/structure.ts       swing highs/lows, BOS, CHoCH, premium/discount
src/core/session.ts         session open resolution, VWAP/POC window
src/core/metrics.ts         ATR, VWAP, session range, point of control
src/core/history.ts         signal history store, ordering, dedupe, relabelling
src/core/candles.ts         bucketing, resampling, live-tail merge
src/core/timeframeEngine.ts one timeframe → three gauges + structure + metrics
src/core/multiTimeframe.ts  every timeframe + the confluence bias
src/core/entryCheck.ts      does the market agree with a long/short? (pure)
src/core/providers/         MarketDataProvider interface + Binance and futures
src/config/compass.ts       every weight, tolerance and session setting
src/hooks/useInstrumentFeed.ts        candles, ticks, order flow for one instrument
src/hooks/useMultiTimeframeCompass.ts runs the engine and publishes history
api/futures/candles.ts      server-side futures candle proxy
api/futures/status.ts       which providers are configured
```

## Tests

```
npm test
```

Covers every indicator against hand-computed values, vote thresholds, the score
mapping, label/score-sign consistency, MTF confluence, the entry check
(including the higher-timeframe warning), session VWAP reset, continuous-market
windows, history ordering and dedupe, order-flow aggregation and market
structure.

## Commands

```
npm run dev        # dev server on :8080
npm run build      # production build
npm test           # unit tests
npm run typecheck  # see the note below
```

For type checking, target the app project explicitly. The root `tsconfig.json`
is solution-style (`files: []`), so `npm run typecheck` / bare `tsc --noEmit`
checks nothing. Vendored `src/components/ui/*` has pre-existing missing-module
errors that predate this work; filter them out:

```
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
```

`npm run lint` is broken upstream (`typescript-eslint` is not installed).

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

A futures provider serves candles on request. Its newest bar is current as of
the last fetch, so the status is reported honestly rather than as a live tick.
