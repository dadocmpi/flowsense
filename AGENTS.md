# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite multi-timeframe market compass for Gold,
the S&P 500, the Dow and the Nasdaq (GC/ES/YM/NQ). Every number is a provider
response or arithmetic over one. Nothing is simulated.

Gold is served by Twelve Data (XAU/USD spot); the three index assets are served
by Alpaca, read through the liquid ETF proxies SPY/DIA/QQQ. Which provider serves
an asset is a per-asset configuration fact (`api/_lib/assets.ts`), overridable by
env, and switching one needs only a config change.

Order flow is separate and real: it comes from the venue's own public market
streams (Binance USDT-M `XAUUSDT`), not from the candles. See "Order flow is
REAL" below.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic values, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **Only ship markets we can source honestly.** Futures come from a configured
  provider. An instrument with no configured source shows "no data source
  configured" and no numbers at all — never a placeholder that looks real.
- **Order flow is real or it is absent.** The flow panel reads the venue's public
  streams. It is never estimated from candles and never carries an ESTIMATED
  badge. A down, stale or geo-blocked feed shows "Feed unavailable" with the
  reason — never a stand-in zero and never a neutral needle.
- **Keys stay server-side.** Each provider's key is read only by the functions
  under `api/` and must never reach the browser. Verify the bundle stays
  credential-free: `grep -c "apikey" dist/assets/*.js` → must be 0. (An
  `ALPACA_API_KEY` / `FUTURES_API_KEY` hit in the bundle is fine only as the
  env-var *name* in help text, never a value. Never prefix an Alpaca variable
  with `NEXT_PUBLIC_`.)

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
src/core/marketSessions.ts     per-provider market calendar (Alpaca = US equity session) (pure)
src/core/instruments.ts        the asset catalog + which provider serves each
src/core/providers/            MarketDataProvider interface + the server-proxied provider
src/core/providers/polling.ts  per-provider poll cadence + server cache TTLs (one place)
src/core/providers/twelvedataWs.ts  pure parsing of the vendor price stream
src/core/providers/binanceFlow.ts   the REAL venue flow feed: socket, reconnect, health, probe
src/core/orderflow/parse.ts         pure parsing of the venue streams (the `m` flag -> aggressor side)
src/core/orderflow/aggregate.ts     minute buckets, per-candle delta, CVD, book imbalance (pure)
src/core/orderflow/reading.ts       closed-candle flow reading: EMA smoothing + hysteresis (pure)
src/core/orderflow/histogram.ts     bounded volume-at-price histogram (pure)
src/core/orderflow/health.ts        pure feed-health state machine (stale watchdog, backoff)
src/core/orderflow/ring.ts          fixed-size ring buffer (bounded memory)
src/core/volumeProfile.ts           POC / VAH / VAL from prints or the live histogram (pure)
src/core/risk.ts                    position size, loss/drawdown buffer, session clock (pure)
src/config/compass.ts          every weight, tolerance and session setting
src/config/indicators.ts       one row per indicator: { id, label, group, showInTable }
src/config/risk.ts             default contract multiplier and risk limits
src/hooks/marketDataStore.ts         one store of series keyed asset:timeframe, loaded once on open
src/hooks/useInstrumentFeed.ts        a per-instrument view over the store
src/hooks/useTimeframeReadings.ts     one reading per (asset, timeframe), kept apart
src/hooks/orderFlowStore.ts           one module-level venue feed, coalesced ~4 UI commits/s
src/hooks/useOrderFlowFeed.ts         a per-timeframe view over the venue feed
api/_lib/assets.ts             THE per-asset provider + symbol mapping (env-overridable)
api/_lib/rateMeter.ts          the shared per-minute meter implementation
api/_lib/creditMeter.ts        the Twelve Data meter instance (credits)
api/_lib/alpacaMeter.ts        the Alpaca meter instance (requests)
api/_lib/symbols.ts            the Twelve Data symbol mapping (the ONE place)
api/_lib/twelvedata.ts         Twelve Data adapter: meter, request, parse, classify error kind
api/_lib/alpaca.ts             Alpaca adapter: meter, request, parse, pagination, classify error kind
api/_lib/candleCache.ts        short-lived Twelve Data candle cache (one vendor call per TTL)
api/_lib/alpacaCache.ts        short-lived Alpaca candle cache, incl. the multi-symbol batch
api/futures/candles.ts         server-side candle proxy (single asset, or one batch per timeframe)
api/futures/status.ts          which providers are configured, what symbol is read, meter state
api/health.ts                  provider credentials + last-call time + calls this minute
api/futures/symbols.ts         symbol discovery, used by npm run check:symbols
api/orderflow/binance-config.ts flow config + server-side REST reachability probe (geo-block vs fault)
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

### Every vendor call goes through its provider's meter

There is ONE meter implementation, `api/_lib/rateMeter.ts`, and TWO instances of
it — one per provider, because the two vendors are metered differently:

- `api/_lib/creditMeter.ts` — Twelve Data, metered in CREDITS. `meteredFetch` in
  `api/_lib/twelvedata.ts` checks it before the request and records the vendor's
  own `api-credits-used` / `api-credits-left` headers after it, and logs one line
  per request. Do not add a `fetch` to `api.twelvedata.com` outside that function:
  a call that skips the meter is exactly how the account gets pinned at its
  ceiling. Discovery (`api/futures/symbols.ts`, `npm run check:symbols`) is the
  only code allowed to touch more than one symbol, and it runs out of band, never
  inside a user request.
- `api/_lib/alpacaMeter.ts` — Alpaca, metered in REQUESTS (default 200/min,
  `ALPACA_REQUESTS_PER_MINUTE`). Alpaca does not report usage in headers, so the
  meter counts the calls it makes. Do not add a `fetch` to `data.alpaca.markets`
  outside `api/_lib/alpaca.ts`.

The two instances are independent budgets: a Twelve Data credit limit never blocks
an Alpaca request and vice versa, so one vendor's problem cannot take the whole
page down.

Each meter is per serverless instance and in memory, so a cold instance starts
empty and is capped for its first minute (`COLD_START_MAX_CREDITS` for Twelve
Data; `ALPACA_COLD_START_MAX_REQUESTS` for Alpaca, sized so one full load's seven
requests get through). A rate-limit response marks that meter exhausted for the
rest of the wall-clock minute. The client shows its own "Rate limit — retrying in
Xs" state with the last series marked Stale; never surface the vendor's raw text.

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
daily reaches. Each request asks for at least 250 candles (`requestedCandles` in
`src/config/compass.ts`) so EMA 200 is valid; a wider window is still ONE request
and so still one credit.

EVERY asset and EVERY timeframe loads on open, driven once by `marketDataStore`:

- Alpaca is metered by REQUESTS and accepts many symbols in one call, so all
  three Alpaca assets for one timeframe arrive in ONE multi-symbol request. Seven
  timeframes are therefore seven requests total, not one per asset per timeframe.
- Twelve Data is metered by CREDITS, so its assets are queued one call at a time
  through the server's credit meter (the existing queue, not bypassed).

Readings are keyed by `asset:timeframe` in `useTimeframeReadings`, so switching
timeframes never mixes their series and a chip for a timeframe loaded earlier
still shows that timeframe's own reading and its age. State is independent per
`(asset, timeframe)`: one failure never blocks another, and each asset shows as
soon as its own series arrives. Do not collapse this back to fetching only the
selected timeframe, and do not reintroduce a per-indicator fetch — every indicator
is computed locally from the candles, so a refresh costs one request per provider
and timeframe, never one per indicator.

An Alpaca candle outside the US regular session (09:30–16:00 ET, weekdays, minus
the NYSE holidays) legitimately stays at the last close. That is NORMAL: the UI
labels the asset "Market closed" and shows the real last-candle age — never
"Stale" and never an error. A market-closed timeframe is marked "Market closed"
and EXCLUDED from the Entry check's timeframe-level agreement figure, with a note
saying so; it is never counted as a disagreement. The calendar lives in
`src/core/marketSessions.ts` (pure, DST-safe through `Intl`).

The live stream carries the 1m bar;
the newest bar of the mergeable timeframes (5m, 15m, 30m, 1h, 4h, 1D) is
refreshed from that 1m tail via `mergeLiveTail`, so a higher timeframe moves
with the market between fetches.

`mergeLiveTail` refuses a partial rebuild: a 1m window covers only hours, so a
daily bucket is usually only partly observed, and rebuilding it from that tail
would report a high/low/volume for a day that has barely started. When the base
window does not reach the bucket open, the natively fetched bar is kept.

### Order flow is REAL, from a public venue feed — never derived from candles

The RIGHT compass is order flow: delta / CVD, order-book imbalance, absorption.
Twelve Data carries NO order-flow data — a candle has no aggressor side and no
order book — so it is never computed from the candle feed. It comes from the
venue's own public market streams.

The source is Binance USDT-M futures, symbol `XAUUSDT` (perpetual), no
authentication and no API key. Three public streams are combined by
`src/core/providers/binanceFlow.ts`:

- `<symbol>@trade` — aggressive prints, carrying the `m` (isBuyerMaker) flag
- `<symbol>@depth20@100ms` — partial book, top 20 levels, every 100 ms
- `<symbol>@bookTicker` — best bid/ask with sizes

THE `m` FLAG. `m = true` means the BUYER was resting, so the AGGRESSOR was the
SELLER; `m = false` means the aggressor was the BUYER. `tradeSide()` in
`src/core/orderflow/parse.ts` is the ONE place that mapping lives; nothing
downstream re-derives it.

This feed is client-side and needs no server proxy — the venue publishes these
streams to any client. The only server route involved is
`api/orderflow/binance-config.ts`, which costs nothing and exists to probe
reachability: a browser WebSocket reports no HTTP status, so a socket that closes
at once is either a network fault or the venue refusing this region, and only a
REST call can tell them apart (the venue answers HTTP 451 to a restricted
location). No key is involved and nothing is metered — this is not the metered
candle feed.

What the RIGHT panel shows, all from real data:

- Net delta per candle and cumulative delta from the aggTrade aggressor side,
  aggregated to the active timeframe. CVD resets at 00:00 UTC and the reset time
  is shown in the UI.
- Book Flow: a 20-level DOM ladder with size, cumulative size and depth bars, and
  the resting-book imbalance `(bid - ask) / (bid + ask)` over the top N levels
  (`orderFlow.imbalanceLevels`, default 10). The Book Flow toggle is ENABLED.
- A trade tape of the last ~30 prints with side and size.
- A basis line: the venue's last price minus the Twelve Data XAU/USD price.

Honesty rules, kept true:

- The venue is labelled factually: `Binance USDT-M XAUUSDT PERP`. It is NOT
  called institutional unless it is a real institutional feed.
- Nothing is fabricated. If the stream is down, stale (no message for more than
  `STALE_AFTER_MS`, 5 s) or geo-blocked (HTTP 451), the panel shows "Feed
  unavailable" with the reason and the real last-update time. No stale figure is
  left looking current.
- The Compass never reads a live-ticking value. The flow reading is built from
  CLOSED candles only (`candleDeltas` drops the forming bucket), smoothed with a
  short EMA, and the Buying / Selling / Neutral word uses a neutral zone plus
  hysteresis. The DOM ladder and the tape are live by nature and are shown live —
  they are never fed into a gauge.
- There is no "estimated" order flow anywhere. The old candle-derived estimate,
  its `none` vendor seam, its `capabilities` switch and its levels line were all
  deleted. Do not reintroduce them.

Robustness: reconnect with exponential backoff and jitter, a forced reconnect
before the venue's 24 h connection limit, a stale watchdog, a feed-health
indicator (connected / latency / last message), and the server reachability probe
that distinguishes a geo-block from a fault. The health state machine is pure
(`src/core/orderflow/health.ts`) so the stale and reconnect behaviour is unit
tested without a network.

Performance: every message is ingested but the UI commits at most ~4 times a
second (a coalesced `setTimeout` in `src/hooks/orderFlowStore.ts`), prints live in
a fixed-size ring, and raw prints fold into 1-minute buckets with two days of
retention, so nothing grows unbounded.

PLUGGING IN ANOTHER FEED. The provider seam is a small adapter shape
(`hasOrderBook`, `hasTrades`, `hasVolume` on the message union in
`src/core/orderflow/types.ts`). A venue that publishes the same three facts —
aggressive prints with a side, a resting book, and a price — drops in behind the
same store and UI without a component change. Keep the venue label factual.

### Volume profile is real, from the venue tape

`src/core/volumeProfile.ts` folds the real aggressive prints into volume-at-price
bins sized by the instrument tick (`orderFlow.tickSize`, configurable in
`src/config/compass.ts`) and reports the point of control (POC) and the 70% value
area (VAH / VAL). The panel shows the current UTC session and the previous one,
plus the session high/low from the candle series. The value-area maths is shared
between the print path and the live histogram path, so both agree exactly.

## UI

A sober, dense risk/trading terminal. The main screen, top to bottom, fits
1920x1080 without scrolling: the top bar (instrument and venue, UTC clock, market
status, per-stream source and data age, feed latency, asset tabs, timeframe
buttons), three compasses in one row, then the merged technical table (two
thirds) beside the entry check (one third), then the Order flow panel beside the
Volume profile panel, then the compact Risk panel.

The timeframe buttons carry the LABEL ONLY — M1 M5 M15 M30 1H 4H 1D. No score,
no signal word, no colour that implies a signal; only the selected one is
highlighted, and every button is disabled while a request is in flight.

There is no multi-timeframe confluence grid, no "Timeframe detail" panel and no
separate "Technical metrics" panel. Do not re-add them. There is exactly ONE
technical table, holding both the moving averages and the oscillators.

The top bar holds the instrument, venue, price and the asset tabs. The removed
"DATA: LIVE", "CANDLES IN" countdown and REFRESH button were obsolete once the
feed became continuous — do not re-add them. Debug-style internals (raw
data-quality percentages, last-bar timestamps, candle counts) belong in a
secondary section below the primary view, not in the primary view.

Every panel is permanently expanded. Do not add collapsible/show-hide controls,
accordions or any other click-to-reveal wrapper: all data must be visible on
page load. The ONE deliberate exception is the "Compass inputs" drawer — a
native `<details>` under the Compass, collapsed by default, that lists every
input feeding the Compass with its state and weight so the signal is auditable
for a reviewer. It is an audit disclosure, not a data panel: it hides nothing
that the table shows.

The header states the feed's real condition: a rate-limited candle feed shows our
own "Rate limit — retrying in Xs" countdown and a Stale badge on the last series;
an asset outside its market's hours shows "Market closed" with the real
last-candle age and no Stale badge. The order-flow panel shows the venue's own
condition (Live / Stale / Down) with latency and last-message age. Never render
the vendor's raw error text, and never leave stale numbers looking current.

The provenance popover on an asset states the provider, the symbol, the feed
(`IEX`) and that the volume is partial market volume — IEX volume is one
exchange's, never consolidated volume — and keeps the PROXY marker. An index asset
read through an ETF is always called a proxy, never the index itself.

### Design system

Palette: three graphite surfaces (`#0a0b0d` / `#101215` / `#16181c`) plus a
raised tone, 1px hairline borders, muted green/red used ONLY for direction and
state, amber ONLY for warnings, and one restrained accent (a desaturated blue)
for selection and focus. No neon, no glows, no gradients, no heavy shadows, no
glassmorphism, no decorative icons or emoji. Keep the palette; refine within it.

Typography: Inter for text and IBM Plex Mono for numbers, both free and loaded
from Google Fonts with system fallbacks. Tabular numerals everywhere,
right-aligned numeric columns, fixed decimals per instrument.

Structure: a consistent 4/8px spacing grid, section headers in small uppercase
with letter-spacing, panels with a quiet header bar (title left; source /
timeframe / timestamp right), a 2-4px corner radius, and dense aligned tables
with subtle row separators and no zebra striping. The shared `Panel` chrome and
the primitives in `src/components/common/ui.tsx` keep this from drifting.

Gauges: flat and restrained, thin arcs, a clear numeric readout, no flashy
needle effects. The label still comes from `labelFromScore`, so it can never
disagree with the score.

States: designed empty, loading and error states for every panel, with no raw
errors and no layout shift. Subtle transitions only, and `prefers-reduced-motion`
is respected. Contrast targets WCAG AA and keyboard focus is always visible.

### Indicator visibility (display only)

`src/config/indicators.ts` is one entry per indicator:
`{ id, label, group, showInTable }`. Setting `showInTable: false` hides the row
from the technical table and NOTHING ELSE — the indicator is still computed and
still feeds the Confluence Compass and the Summary. The Compass result is
identical whether a row is shown or hidden; `src/core/__tests__/indicatorVisibility.test.ts`
proves it. Default-hidden (redundant with an SMC + confluence read): Williams %R,
Ultimate Oscillator, Bull/Bear Power, ROC, Highs/Lows. Edit the config to change.

### Risk panel (client-side only)

The Risk panel (`src/components/risk/RiskPanel.tsx`, maths in `src/core/risk.ts`)
is fully client-side with manual inputs and no external data: a position-size
calculator (balance, risk %, stop in points, configurable contract multiplier —
default 100 oz per 1.00 lot for XAUUSD), a daily-loss / max-drawdown buffer
tracker, and a session clock (Asia / London / New York, in UTC). It must NEVER be
read by the Compass, the Summary or the Entry check. No trading firm's rules are
hardcoded and nothing is presented as an official limit — every limit is
user-editable.

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
npm run knip       # dead-code / unused-dependency report
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
[twelvedata] 2026-01-02T14:31:00.310Z endpoint=time_series symbol=XAU/USD timeframe=30m credits=1 status=200 vendorUsed=2 vendorLeft=6 meterUsed=2/8 meter=OK
```

Every Alpaca request logs its own line under the `[alpaca]` tag. `bars=` is the
bar count per symbol in that page, `page=`/`pages` shows pagination, and
`meterUsed=` is the REQUEST count. A vendor message is included on an error, with
any key-shaped token redacted — a key is never logged.

```
[alpaca] 2026-01-02T14:31:00.512Z endpoint=stocks_bars symbols=SPY,DIA,QQQ timeframe=15m page=1 status=200 bars=SPY:300,DIA:300,QQQ:300 meterUsed=1/200 meter=OK
[alpaca] 2026-01-02T14:31:01.004Z endpoint=stocks_bars symbols=SPY timeframe=15m page=1 status=401 meterUsed=2/200 meter=OK note=AUTH message=invalid credentials supplied
```

A blocked call never reaches the vendor and logs `status=BLOCKED` with the
meter's reason instead. One full load is 7 Alpaca requests (all three symbols
each) plus 7 Twelve Data credits (Gold). `GET /api/health` costs no vendor calls
and reports each provider's credentials, last call time and calls this minute.

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
