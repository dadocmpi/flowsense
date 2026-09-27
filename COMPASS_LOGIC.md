# What the compass signal is built from

This document explains, in plain English, what data and logic drive the
FlowSense compass — the hero gauge at the top of the dashboard. It describes
the code as it currently stands. It is documentation only; nothing here changes
the signal.

The short version: the compass is a **weighted vote** across a fixed set of
factors. Each factor looks at real market data, decides it is bullish, bearish
or neutral, and casts a vote with a weight. The votes are summed into a single
0–100 score. Every visible part of the gauge — needle angle, colour, direction
word and confidence number — is derived from that one score, so they can never
disagree with each other.

---

## 1. Where the logic lives

| Concern | File |
| --- | --- |
| Assembling the factor list and driving the hook | `src/hooks/useCompassSignal.ts` |
| Weighted-vote aggregation, scoring, publishing | `src/lib/compassEngine.ts` |
| Score → direction / needle / colour / confidence | `src/lib/compassEngine.ts` |
| Multi-timeframe scoring | `src/hooks/useMultiTimeframe.ts` |
| Market-context factor (zones, structure, order book) | `src/hooks/useMarketContextEngine.ts` |
| Higher-timeframe trend factor | `src/hooks/useMacroContext.ts` |
| Volatility regime factor | `src/hooks/useFundamentalIntelligence.ts` |
| Support/resistance and reversal factors | `src/hooks/useSrReversal.ts` |
| Indicator summaries | `src/lib/marketAnalysis.ts` |
| Live price, candles, order book and trade tape | `src/hooks/useMarketData.ts` |

`useCompassSignal` is the single entry point. It calls the hooks above, turns
their outputs into `FactorContribution[]`, and hands the list to
`computeLiveAnalysis` in `compassEngine.ts`.

---

## 2. Timeframes used

The compass does **not** run one model per timeframe and average them at the top
level. Instead, timeframe structure enters through two factors:

1. **`MTF_ALIGNMENT`** (see §3.2) scores each of six timeframes and combines
   them.
2. **`HTF_TREND`** (see §3.5) reads price against a single EMA200 computed on
   the base series.

The multi-timeframe factor scores these six timeframes, with these fixed weights:

| Timeframe | Weight |
| --- | --- |
| 1m | 0.05 |
| 5m | 0.10 |
| 15m | 0.15 |
| 1h | 0.20 |
| 4h | 0.25 |
| 1d | 0.25 |

The base series is 5-minute candles. Timeframes equal to or shorter than the
base interval use the base series directly; longer ones are aggregated from it
with `aggregateCandles`. A timeframe is skipped if it has fewer than 30 candles.

Each timeframe is scored from its own candles with two components:

- **Trend (60%):** the gap between EMA20 and EMA50 as a percentage of price,
  normalised by 1.5%. Positive means the fast average is above the slow one.
- **Momentum (40%):** RSI(14) distance from 50, normalised by 25 points.

The two are blended into a composite in the range −1…+1. A timeframe is `BUY`
when the composite is above +0.15, `SELL` below −0.15, otherwise `NEUTRAL`.
Strength is the absolute composite as 0–100. The timeframes' signed strengths
are then combined by their weights into a `weightedScore` (−100…+100), which
drives the `MTF_ALIGNMENT` factor's direction and weight.

> **Note on the 1m row.** Because the base series is 5-minute candles, the 1m
> timeframe resolves to the same 5-minute series as 5m, so those two rows
> currently vote identically. This is existing behaviour, not something changed
> by the layout work; it is flagged here for transparency.

---

## 3. Every factor that feeds the compass

These are all the factors that can currently be pushed into the vote, in the
order they are built in `useCompassSignal`. Each has a category, a direction, a
weight and a confidence value.

### 3.1 `MARKET_CONTEXT` — zone / structure / order-book confluence
Source: `useMarketContextEngine`. This is the most involved factor. It runs a
full contextual pipeline over the candles and live order flow:

- Data-quality assessment, then market structure analysis
- Institutional zone detection: **Fair Value Gaps (FVG)**, **Order Blocks**,
  **Point of Control (POC)**, swing highs/lows, liquidity levels and a
  user-defined manual daily zone
- Zone clustering and proximity ranking
- Signal-factor building (structure, zones, volume, order flow, order-book
  imbalance, EMA cloud, oscillators) with correlation collapse
- Confluence scoring, an EMA200 master-trend gate, persistence windows, a state
  machine and a reaction-quality filter

Its `uiSummary.score` becomes the factor: **≥60 bullish, ≤40 bearish, otherwise
neutral**. The factor's weight is the share of bullish confluence
(`buyCount / (buyCount + sellCount) × 100`), and its confidence is the engine's
own data-quality score. Even though this factor covers many sub-indicators, it
enters the compass as a **single vote**.

### 3.2 `MTF_ALIGNMENT` — trend alignment across timeframes
Source: `useMultiTimeframe`. Counts how many of the six timeframes are `BUY`
versus `SELL`. Direction is whichever side has more votes; weight is the winning
share (`max(buy, sell) / total × 100`). Confidence is
`60 + |weightedScore| / 100 × 30`, i.e. higher when the timeframes agree
strongly.

### 3.3 `TECHNICAL_SUMMARY` — classic indicator summary
Source: `buildIndicators` + `buildSummary` in `marketAnalysis.ts`, which covers
RSI, MACD, momentum, moving averages and volume/volatility indicators. Each
indicator contributes a buy/sell/neutral tally (strong readings count double);
the score is `buy / (buy + sell) × 100`. **≥60 bullish, ≤40 bearish, otherwise
neutral.** This factor has a **fixed weight of 20**; confidence is overall data
quality.

### 3.4 `VOLATILITY_REGIME` — volatility from real ATR
Source: `useFundamentalIntelligence`. Computes ATR(14) as a percentage of price:

| ATR % of price | Regime | Vote |
| --- | --- | --- |
| ≥ 1.5 | EXTREME | BEARISH, weight 10 |
| ≥ 0.8 | HIGH | BEARISH, weight 8 |
| ≤ 0.15 | LOW | NEUTRAL, weight 5 |
| otherwise | NORMAL | no factor is emitted |

High volatility is treated as a bearish risk factor; low volatility is a mild
neutral reading. Confidence 70 (high/extreme) or 65 (low).

### 3.5 `HTF_TREND` — higher-timeframe trend bias
Source: `useMacroContext`. Reads current price against an EMA200 on the base
series, with a session-based multiplier (London/NY overlap up-weights the read;
Asia and closed sessions down-weight it). When the resulting bias is
bullish/bearish, a factor is emitted with direction matching the bias and a
**fixed weight of 10** and confidence 75. A neutral bias emits no factor. (Cross-
market inputs such as DXY and yields are **not** available on this data plan and
are reported as flat, never invented.)

### 3.6 `AGGRESSOR_DELTA` — live buy/sell pressure
Source: `useMarketData`, from the Binance aggregated-trade tape. Compares real
buyer-initiated volume to seller-initiated volume:
`deltaRatio = (buyerVolume − sellerVolume) / (buyerVolume + sellerVolume)`.
Above +0.1 → BULLISH, below −0.1 → BEARISH, otherwise NEUTRAL. Weight is
`min(100, round(|deltaRatio| × 150))`, so a lopsided tape votes harder.
Confidence 70. Emitted only once trades have arrived.

### 3.7 `SR_ZONE_BIAS` — support/resistance proximity
Source: `useSrReversal`. Builds support/resistance levels from previous
session/day/weekly highs and lows, the opening range, swing highs/lows and the
high-volume point of control. Levels **within 1% of price** are counted:
nearby supports add to the bullish side, nearby resistances to the bearish side,
each scaled by `strength × confidence`. Direction is whichever side outweighs
the other; weight is `min(100, round(totalWeight / 2))`.

### 3.8 `REVERSAL_SIGNAL` — price at a watched level
Source: `useSrReversal`. Emitted only when price is **touching** a level (within
0.1% of price) whose confidence is ≥60. Touching support votes BULLISH,
touching resistance votes BEARISH. Weight is half the reversal confidence
(`round(confidence / 2)`). Volume behaviour (expansion vs. exhaustion) is
computed as supporting detail on the reversal signal, and the timeframe
alignment of the touched level feeds its confidence.

### Summary table of factors

| Factor | Category | Typical weight | Direction source |
| --- | --- | --- | --- |
| `MARKET_CONTEXT` | ZONE_CLUSTER | bullish-confluence % | zone/structure confluence score |
| `MTF_ALIGNMENT` | STRUCTURE | winning timeframe share | timeframe vote counts |
| `TECHNICAL_SUMMARY` | OSCILLATOR | 20 (fixed) | indicator buy/sell tally |
| `VOLATILITY_REGIME` | VOLATILITY | 5–10 | ATR % of price |
| `HTF_TREND` | MACRO | 10 (fixed) | price vs EMA200 |
| `AGGRESSOR_DELTA` | ORDER_FLOW | 0–100 | executed trade-tape imbalance |
| `SR_ZONE_BIAS` | SUPPORT_RESISTANCE | 0–100 | nearby S/R level balance |
| `REVERSAL_SIGNAL` | REVERSAL | 0–~45 | price touching an S/R level |

---

## 4. How the factors are combined

`computeLiveAnalysis` performs a **weighted vote**, not an average of averages:

1. Every factor's weight is added to one of four buckets according to its
   direction: **buyWeight**, **sellWeight**, **neutralWeight** or
   **unavailableWeight**.
2. `totalWeight` is the sum of all four buckets (with a floor of 1 to avoid
   dividing by zero). Neutral and unavailable factors still count toward the
   total, so a pile of neutral factors pulls the score toward the middle.
3. The score is:

   ```
   rawScore = round(((buyWeight − sellWeight) / totalWeight) × 100 + 50)
   ```

   50 is dead neutral, 100 is maximum bullish, 0 is maximum bearish.

4. The direction label comes from that same score (see §6).
5. **Agreement** — `factorAgreement` — is `max(buyWeight, sellWeight) /
   (buyWeight + sellWeight) × 100`. It measures how united the factors that
   actually took a side are, weighted by their contribution. It is deliberately
   *not* the share of factors that reported data: a set of factors that all
   disagree must not read as 100% agreement.

The factor list is rebuilt every time any underlying input changes (price,
candles, indicators, order flow, macro/volatility context, S/R factors or
config), so the score always reflects the newest data available.

---

## 5. When the compass updates (real-time vs periodic)

There are two clocks, and this is important:

- **The needle and the live score move in real time.** `useMarketData` holds one
  combined WebSocket and commits a coalesced snapshot to React roughly every
  **150 ms**. Each commit can change order flow and the open candle, which
  recomputes the live analysis and therefore the score and needle angle. In
  practice the needle reacts within a second or two of market activity. The
  needle animates to its new angle with a 900 ms transition.

- **The "official" signal is published once per minute.** A 1-second timer in
  `useCompassSignal` watches the minute key; when the minute rolls over it calls
  `publishOfficialSignal`, which freezes the current reading into the official
  snapshot and appends it to the signal history. History is stored in
  `localStorage` and capped at 100 entries.

The gauge shows the **live** score while the feed is healthy and falls back to
the last official score when there is no live reading. Because the official
snapshot is only republished at minute boundaries, the live needle can visibly
differ from the most recent history entry — that is expected.

Rendering is driven by data, not by a candle-close timer or a manual refresh.
A dropped socket triggers the client's capped-backoff reconnect; on the next
`LIVE` the hook re-seeds history, and the UI shows a reconnecting banner rather
than presenting stale data as live.

There is one staleness guard: `computeLiveAnalysis` marks a reading stale if its
timestamp is older than 60 s (`maxDataAgeMs`). Since the live timestamp is set at
compute time, this mainly matters for a frozen feed.

---

## 6. Thresholds and labels

The 0–100 score maps to a direction in `scoreToDirection`, using these default
thresholds (`DEFAULT_COMPASS_CONFIG`):

| Score | Label |
| --- | --- |
| ≥ 75 | **Strong buy** |
| 55 – 74 | **Buy** |
| 45 – 54 | **Neutral** |
| 26 – 44 | **Sell** |
| ≤ 25 | **Strong sell** |

The needle angle is a straight linear mapping of the same score: 0 → −90°
(far left), 50 → 0° (straight up), 100 → +90° (far right). The colour is
interpolated from the same score between five anchors: strong sell (red),
sell (light red), neutral (amber), buy (teal), strong buy (green).

**Confidence** is not the factor agreement. It is derived from the score itself:

```
distanceFromNeutral = |score − 50| / 50
confidence = round(quality × (0.35 + 0.65 × distanceFromNeutral) × 100)
```

where `quality` is the overall data-quality percentage (0–100) divided by 100.
This means a reading near neutral can never claim high confidence, and a reading
pinned to an extreme can never claim low confidence. Data quality scales the
ceiling without changing the shape of the curve.

### The publish gate (anti-noise)

An official signal is only published when **all** of these hold:

- At least **3** factors have data (`minValidFactors`),
- overall data quality is at least **40** (`minConfidence`),
- factor agreement is at least **55%** (`minFactorAgreement`).

If the gate is not met, the previous official signal is retained (and marked
stale) rather than replaced. Other config values — `scoreThreshold`,
`directionChangeThreshold` and `scoreToDirection`'s boundaries — come from the
same `DEFAULT_COMPASS_CONFIG`.

---

## 7. Data sources and honesty rules

Every input above is derived from real Binance public market data: REST-seeded
5-minute klines plus one combined WebSocket carrying `@ticker`, `@kline_5m`,
`@depth10@100ms` and `@aggTrade`. Nothing is simulated, and cross-market feeds
(DXY, VIX, yields) and the economic calendar are out of scope and reported as
unavailable rather than fabricated. See `AGENTS.md` for the project's data-
integrity rules.
