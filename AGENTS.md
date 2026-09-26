# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite trading analysis dashboard. All market
data comes from Binance's public market-data API (REST + WebSocket). Nothing is
simulated.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic order flow, no
  placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **Only ship markets we can source honestly.** The app is crypto-only (Binance
  USDT spot pairs) on purpose. Do not add forex, indices or stocks unless the
  data source also provides real order flow for them.
- **No API key exists.** Binance's public endpoints are unauthenticated and
  CORS-open. Never add a key, a proxy, or a `VITE_*` secret. Verify the bundle
  stays credential-free: `grep -c "apikey" dist/assets/*.js` → must be 0.
- **Order flow must be real.** Every bid, ask, trade and buy/sell percentage must
  come from a Binance response. Do not reintroduce hardcoded values such as a
  fixed 50/50 buyer/seller split or a constant `volumeDelta` — an earlier version
  did exactly that, and it was a lie in the UI.

## Architecture

```
src/lib/binanceClient.ts       REST + WebSocket client, host fallback, error mapping
src/lib/indicators.ts          pure indicator math, no I/O
src/lib/marketAnalysis.ts      aggregation, derived ranges, buildIndicators/buildSummary
src/hooks/useMarketData.ts     the single data entry point (REST + live stream)
src/hooks/useMarketContextEngine.ts   context engine; consumes real order flow
src/components/trading/RealtimeOrderFlow.tsx  book depth, tape, buy/sell split
```

Host fallback order (REST and WS alike): `data-api.binance.vision` →
`api.binance.com` / `stream.binance.com:9443` → `api.binance.us` /
`stream.binance.us:9443`. Some regions get HTTP 451 on the main domains; the
client remembers the first host that answers. `data-api.binance.vision` and
`data-stream.binance.vision` are the official public market-data mirrors and are
the most reliable choice.

## Real aggressor flow

- `aggTrade.m === true` means the **buyer was the maker**, so the seller
  aggressed → `SELL`. This is the exchange's own flag, not an inference.
- Kline field 9 is taker-buy base volume, a genuine per-candle aggressor split.
  `aggregateCandles` sums it so higher timeframes keep the split.

## Commands

```
npm run dev        # :8080
npm run build
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "^src/components/ui/"
```

The root `tsconfig.json` is solution-style (`files: []`), so `npm run typecheck`
and a bare `tsc --noEmit` check nothing at all. Always pass
`-p tsconfig.app.json`. `src/components/ui/*` carries pre-existing missing-module
errors (`cmdk`, several `@radix-ui/*` packages) and is not ours to fix, hence the
grep. `npm run lint` is broken upstream (`typescript-eslint` not installed).

## Testing indicator math

Indicators are pure functions, so verify them against hand-computed values with
esbuild + node rather than adding a test framework:

```
npx esbuild /tmp/check.mjs --bundle --format=esm --platform=node \
  --outfile=/tmp/bundle.mjs && node /tmp/bundle.mjs
```

Watch out for warmup lengths: MACD(12,26,9) needs ~34 points, Bollinger(20,2)
needs 20. A "null" result usually means too few candles, not a broken indicator.
On a perfectly linear ramp MACD equals its signal line — use an accelerating
series to test a bullish crossover.
