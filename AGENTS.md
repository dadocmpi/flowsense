# AGENTS.md

## What this app is

FlowSense: a React + TypeScript + Vite trading analysis dashboard. All market
data comes from Twelve Data via a server-side proxy. Nothing is simulated.

## Hard rules

- **Never fabricate market data.** No random walks, no synthetic order flow,
  no placeholder prices that look real. If data is unavailable, show an honest
  unavailable state (`--`, `DATA: UNAVAILABLE`) and an error kind.
- **The API key never reaches the browser.** `TWELVEDATA_API_KEY` has no `VITE_`
  prefix and is read only inside `api/_twelvedata.ts`. Verify with
  `grep -c "apikey" dist/assets/*.js` → must be 0.
- **Twelve Data has no order book, tape, or order flow.** Do not reintroduce
  concepts like buy/sell pressure, delta, absorption, or tape confirmation.
  Anything flow-like must be derived from candle volume and labelled as volume.

## Architecture

```
api/_twelvedata.ts             proxy core, shared by both environments
api/twelvedata.ts              Vercel serverless entrypoint
vite-plugins/twelvedata-proxy  dev middleware at /api/twelvedata
src/lib/twelveDataClient.ts    browser fetch + TwelveDataError mapping
src/lib/creditBudget.ts        free-plan budget (8/min, 800/day)
src/lib/indicators.ts          pure indicator math, no I/O
src/lib/marketAnalysis.ts      aggregation, derived ranges, buildIndicators/buildSummary
src/hooks/useMarketData.ts     the single polling data entry point
```

Proxy validation order: endpoint allow-list → param validation → API key check →
cache → upstream. Params are validated before the key so junk requests fail fast
and cheap.

## Free vs paid plan

Free tier covers US stocks, forex, and crypto. `XAU/USD` and `SPX` need Grow or
above; they carry `requiresPaidPlan: true` in `src/types/trading.ts` and render a
`· PAID PLAN` badge. `EUR/USD` is the default so a free key works immediately.

## Commands

```
npm run dev        # :8080
npm run build
npx tsc -p tsconfig.app.json --noEmit
```

Known: `src/components/ui/*` has pre-existing errors (`cmdk`,
`@radix-ui/react-dialog` are not in `package.json`). Those files are vendored
shadcn components and are not touched. Filter them when checking types:
`npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "src/components/ui/"`

`npm run lint` is broken upstream (`typescript-eslint` not installed).

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
