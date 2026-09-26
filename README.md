# FlowSense

Trading analysis dashboard. Market data comes from **Twelve Data** through a
server-side proxy; no data is fabricated anywhere in the client.

## Data source: Twelve Data (REST only)

The free plan is REST-only and polling-based. There is **no WebSocket, no order
book, no order flow, and no tape** — those concepts do not exist in this app.
Everything is derived from real candles plus indicators computed locally.

What the free plan covers: US stocks, forex, and crypto in real time. Commodities
(`XAU/USD`) and indices (`SPX`) require the Grow plan or above. Assets that need
a paid plan are flagged in the UI with a `· PAID PLAN` badge and are defined by
`requiresPaidPlan` in `src/types/trading.ts`. `EUR/USD` is the default selection
so a free key works out of the box.

Credit budget: 8 credits/minute and 800/day. `src/lib/creditBudget.ts` tracks a
rolling local budget so the app degrades instead of burning the daily allowance.

## Setup

1. Get a key at <https://twelvedata.com/>.
2. Create `.env.local` in the project root:

   ```
   TWELVEDATA_API_KEY=your_key_here
   ```

   The variable has no `VITE_` prefix on purpose — it must never be bundled into
   the browser. `.env*` is gitignored.

3. `npm install && npm run dev` → <http://localhost:8080/>

## The proxy

The browser only ever talks to `/api/twelvedata`. The key stays server-side.

| Environment | Implementation |
| --- | --- |
| `vite dev` | `vite-plugins/twelvedata-proxy.ts` middleware |
| Vercel | `api/twelvedata.ts` serverless function |

Both share the same core logic in `api/_twelvedata.ts`, which allow-lists
endpoints (`time_series`, `quote`, `price`, `exchange_rate`), allow-lists query
parameters, validates symbols, caps `outputsize`, caches responses briefly, and
times out after 12s. `vercel.json` excludes `/api/*` from the SPA rewrite so the
function is reachable in production.

Client-side errors are surfaced as honest states rather than fake numbers:
`MISSING_API_KEY`, `PLAN_LIMIT`, `RATE_LIMIT`, `SYMBOL_NOT_FOUND`, `NETWORK`,
`UPSTREAM`.

## Layout

```
api/_twelvedata.ts             proxy core (shared)
api/twelvedata.ts              Vercel entrypoint
vite-plugins/twelvedata-proxy  dev-server middleware
src/lib/twelveDataClient.ts    fetch + error mapping
src/lib/creditBudget.ts        rate-limit budget
src/lib/indicators.ts          SMA/EMA/RSI/MACD/Bollinger/ATR/VWAP/volume profile
src/lib/marketAnalysis.ts      candle aggregation, derived ranges, indicator set
src/hooks/useMarketData.ts     polling hook (the single data entry point)
src/hooks/useCompassSignal.ts  orchestrates the real hooks
```

## Commands

```
npm run dev        # dev server on :8080
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint
```

Note: `npm run typecheck` reports pre-existing errors in `src/components/ui/*`
(missing `@radix-ui/react-dialog` / `cmdk` declarations) that predate this work.
The application code itself is clean.
