# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite multi-timeframe market compass for Gold,
the S&P 500, the Dow and the Nasdaq (GC/ES/YM/NQ). Every number is a provider
response or arithmetic over one. Nothing is simulated.

Gold is served by Twelve Data (XAU/USD spot); the three index assets are served
by Alpaca, read through the liquid ETF proxies SPY/DIA/QQQ. Which provider serves
an asset is a per-asset configuration fact (`api/_lib/assets.ts`), overridable by
env, and switching one needs only a config change.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic values, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **Only ship markets we can source honestly.** Futures come from a configured
  provider. An instrument with no configured source shows "no data source
  configured" and no numbers at all — never a placeholder that looks real.
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
src/core/providers/orderflow.ts     OrderFlowProvider interface + the server-proxied `http` adapter
src/core/providers/capabilities.ts  what each order-flow VENUE can supply (hasOrderBook, hasVolume)
src/config/compass.ts          every weight, tolerance and session setting
src/hooks/marketDataStore.ts         one store of series keyed asset:timeframe, loaded once on open
src/hooks/useInstrumentFeed.ts        a per-instrument view over the store
src/hooks/useOrderFlow.ts             the selected (asset, timeframe)'s real order-flow reading (venue-independent)
src/hooks/useTimeframeReadings.ts     one reading per (asset, timeframe), kept apart
src/components/flow/OrderFlowPanel.tsx  the RIGHT compass: real tape + book from the venue
api/_lib/assets.ts             THE per-asset provider + symbol mapping (env-overridable)
api/_lib/rateMeter.ts          the shared per-minute meter implementation
api/_lib/creditMeter.ts        the Twelve Data meter instance (credits)
api/_lib/alpacaMeter.ts        the Alpaca meter instance (requests)
api/_lib/binanceMeter.ts       the Binance meter instance (requests)
api/_lib/symbols.ts            the Twelve Data symbol mapping (the ONE place)
api/_lib/twelvedata.ts         Twelve Data adapter: meter, request, parse, classify error kind
api/_lib/alpaca.ts             Alpaca adapter: meter, request, parse, pagination, classify error kind
api/_lib/candleCache.ts        short-lived Twelve Data candle cache (one vendor call per TTL)
api/_lib/alpacaCache.ts        short-lived Alpaca candle cache, incl. the multi-symbol batch
api/futures/candles.ts         server-side candle proxy (single asset, or one batch per timeframe)
api/futures/status.ts          which providers are configured, what symbol is read, meter state
api/health.ts                  provider credentials + last-call time + calls this minute
api/futures/symbols.ts         symbol discovery, used by npm run check:symbols
api/orderflow/reading.ts       is an order-flow venue configured, and its real reading (per asset)
api/_lib/orderflow.ts          THE file to edit to connect an order-flow vendor; picks the venue PER ASSET
api/_lib/binance.ts            Binance order-flow adapter: depth + aggTrades -> delta/CVD/imbalance
api/_lib/alpacaOrderflow.ts    Alpaca order-flow adapter: trades (tick rule) + IEX top of book -> delta/CVD/imbalance
scripts/checkSymbols.mjs       discovery CLI (bundles symbols.ts, no copy)
```

All indicator, scoring, structure, session and history logic is pure and lives
under `src/core` so it can be unit tested without a browser. Keep it that way:
no I/O, no clock, no React in `src/core`.

### The futures feed is polled, or streamed when the server offers it

The provider is asked for candles on a cadence tied to the timeframe, and the
price is polled every `PRICE_POLL_INTERVAL_MS` (30s) when no tick feed is in
use. Because a polled close is not a tick, the status must not claim a tick
feed. When the server exposes a browser-safe price
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

### Order flow is a separate provider, never derived from candles

The RIGHT compass is order flow: delta/CVD, order-book imbalance, absorption.
Twelve Data carries NO order-flow data — a candle has no aggressor side and no
order book — so it is never computed from the candle feed. It comes from a real
VENUE behind `src/core/providers/orderflow.ts`, chosen server-side PER ASSET
(`api/_lib/orderflow.ts`).

TWO real venues ship, and the venue is a per-asset fact:

- **Gold (GC) reads Binance** (`api/_lib/binance.ts`): its public market-data API
  carries a resting depth BOOK and a TAPE with the aggressor side of every trade
  (`aggTrades`). Gold is read as PAXG/USDT (PAX Gold, 1 token = 1 troy ounce) — a
  real gold market. The venue needs no key.
- **The index assets (ES/YM/NQ) read Alpaca** (`api/_lib/alpacaOrderflow.ts`):
  the same provider that serves their candles, so no extra key. It reads the
  trade TAPE (`/v2/stocks/trades`) and the latest best bid/ask (`/v2/stocks/quotes/latest`).

Alpaca's equities API is not a futures book, and the adapter must not pretend it
is. Three facts are disclosed, never hidden: a stock trade carries **no aggressor
side**, so buy/sell is classified with the standard **tick rule** (a print above
the previous one is buyer-initiated, below is seller-initiated, unchanged carries
the previous side) — an inference over real prints, not a fabricated number;
Alpaca exposes **no depth beyond the top of book**, so "book imbalance" is the
best bid SIZE against the best ask SIZE — a real one-level book, labelled "Top of
book", never called a depth ladder; and the feed is pinned to **IEX**, so that
best bid/ask is **IEX's own top of book, one exchange's quote — NOT the
consolidated NBBO** (which needs the SIP feed). The UI never claims NBBO.

`ORDERFLOW_PROVIDER` overrides the venue for the WHOLE deployment (`none` switches
it off everywhere); `ORDERFLOW_PROVIDER_<ID>` overrides one asset. The defaults
live in `DEFAULT_ORDERFLOW_VENUE` in `api/_lib/orderflow.ts`.

The reading is fetched INDEPENDENTLY of the candle feed (`src/hooks/useOrderFlow.ts`
+ `/api/orderflow/reading`), so the RIGHT card shows real flow even when the
candle provider has nothing for the instrument.

When there is no real reading — the venue is off, has no market for the
instrument, or cannot be reached — the card says so and draws NO gauge. It must
never draw a neutral needle or a `0` in place of a missing real reading: a
neutral needle looks like a real "neutral market" read. There is no candle-derived
estimate anywhere in the build; order flow is either real or absent.

Connecting a different vendor means implementing `fetchOrderFlowReading` in
`api/_lib/orderflow.ts` and setting `ORDERFLOW_PROVIDER` /
`ORDERFLOW_API_KEY`. Nothing else changes: the client, the summary blend and the
entry check already speak that shape. The key stays server-side; check
`grep -c "apikey" dist/assets/*.js` is still 0 after adding one.

### Every order-flow call goes through the venue's meter

Each venue has its OWN meter instance, so one venue's limit can never block
another: `api/_lib/binanceMeter.ts` for Binance and `api/_lib/alpacaMeter.ts` for
Alpaca (the Alpaca order-flow calls share the Alpaca candle meter, since both are
Alpaca requests). `binanceGet` in `api/_lib/binance.ts` checks the Binance meter
before the request and records it after; the Alpaca order-flow calls go through
`fetchAlpacaTrades` / `fetchAlpacaLatestQuote` in `api/_lib/alpaca.ts`, which use
the same metered `alpacaGetJson` gate. Do not add a `fetch` to a Binance host
outside `binanceGet`, or to `data.alpaca.markets` outside `api/_lib/alpaca.ts`.

Binance serves the same public API from several hosts and some are geo-restricted
(HTTP 451). The adapter tries `data-api.binance.vision`, then `api.binance.us`,
then `api.binance.com`, remembers the first that answers, and only fails when all
are unreachable. Pin one with `BINANCE_BASE_URL`.

### The Book Flow toggle is a venue capability, never hardcoded

`src/core/providers/capabilities.ts` maps a venue to what it can supply
(`hasOrderBook`, `hasVolume`). Binance: a real multi-level book and a real tape.
Alpaca: a real tape and the IEX best bid/ask — a real but ONE-LEVEL book, so
Book Flow is offered and labelled "Top of book". The RIGHT panel renders the
ORDER FLOW / BOOK FLOW toggle ONLY when the venue has a book AND the instrument
has a live reading to switch modes on — never for a venue with no book, and never
for an instrument the venue has no market for. With no book there is no toggle at
all (not a disabled one) and Order Flow is the only mode. A venue with a real book
lights the toggle
up with no UI change, and `orderFlowBookLabelForVenue` names the book honestly
("Depth" for Binance, "Top of book" for Alpaca).

### The Summary blends the real reading, or is the technical reading

`buildSummaryGauge` (`src/core/scoring.ts`) blends the technical gauge with the
REAL order-flow reading when one exists (`orderFlowBlend` in
`src/config/compass.ts`). With no real reading the Summary IS the technical
reading — it is never a blend against a stand-in zero.

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
"Rate limit — retrying in Xs" countdown and a Stale badge on the last series; an
asset outside its market's hours shows "Market closed" with the real last-candle
age and no Stale badge. Never render the vendor's raw error text, and never leave
stale numbers looking current.

The provenance popover on an asset states the provider, the symbol, the feed
(`IEX`) and that the volume is partial market volume — IEX volume is one
exchange's, never consolidated volume — and keeps the PROXY marker. An index asset
read through an ETF is always called a proxy, never the index itself.

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

The index assets' order-flow reads log under the same `[alpaca]` tag with their
own `endpoint=`: `stocks_trades` for the tape and `stocks_quotes_latest` for the
top of book. One order-flow reading is one trades page (plus a page or two when
the tape is busy) and one quote — a handful of requests against the same 200/min
budget.

```
[alpaca] 2026-01-02T14:31:02.010Z endpoint=stocks_trades symbols=SPY status=200 meterUsed=8/200 meter=OK
[alpaca] 2026-01-02T14:31:02.140Z endpoint=stocks_quotes_latest symbols=SPY status=200 meterUsed=9/200 meter=OK
```

A blocked call never reaches the vendor and logs `status=BLOCKED` with the
meter's reason instead. One full load is 7 Alpaca requests (all three symbols
each) plus 7 Twelve Data credits (Gold). `GET /api/health` costs no vendor calls
and reports each provider's credentials, last call time, calls this minute, and
each asset's order-flow venue.

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
