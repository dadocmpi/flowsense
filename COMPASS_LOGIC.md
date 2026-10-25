# What the compass is built from

This document explains, in plain English, how the FlowSense compass produces its
reading. It describes the code as it currently stands. It is documentation only;
nothing here changes the signal.

The short version: for each timeframe, the compass is a **weighted vote** across
a fixed set of factors. Every factor looks at real candle data, decides Buy,
Neutral or Sell, and casts a vote with a weight. The votes are combined into a
single score from −100 to +100. The label is derived from that score, so the
label and the score can never disagree.

---

## 1. Where the logic lives

| Concern | File |
| --- | --- |
| Indicator math (SMA, EMA, RSI, MACD, ADX, …) | `src/core/indicators.ts` |
| Per-indicator and per-MA vote logic | `src/core/votes.ts` |
| Gauge building, score → label, confluence | `src/core/scoring.ts` |
| Market structure (swings, BOS, CHoCH, premium/discount) | `src/core/structure.ts` |
| Entry check: does the market agree with a long/short? | `src/core/entryCheck.ts` |
| Session open resolution (RTH/FULL, DST-safe) | `src/core/session.ts` |
| ATR, VWAP, session range, point of control | `src/core/metrics.ts` |
| Signal history store: ordering, dedupe, relabelling | `src/core/history.ts` |
| Candle bucketing, resampling, live-tail merge | `src/core/candles.ts` |
| One timeframe → three gauges + structure + metrics | `src/core/timeframeEngine.ts` |
| Every timeframe + the confluence bias | `src/core/multiTimeframe.ts` |
| Entry-check rules (higher timeframes, agreement shares) | `src/config/compass.ts` |
| Every weight, tolerance and session setting | `src/config/compass.ts` |
| Data entry point for one instrument | `src/hooks/useInstrumentFeed.ts` |
| Runs the engine, publishes history | `src/hooks/useMultiTimeframeCompass.ts` |

Everything in `src/core` is pure: no I/O, no clock, no React. That is what makes
it testable without a browser, and it is deliberate — keep it that way.

---

## 2. Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, displayed as
`M1`, `M5`, `M15`, `M30`, `1H`, `4H`, `1D`, `1W`.

Each timeframe is fetched from the provider at its own interval, not aggregated
from one base series. A 1m seed cannot reach back far enough to fill a weekly, so
aggregating everything from 1m would silently leave the higher timeframes empty.

The live stream carries the 1m bar. The newest bar of the mergeable timeframes
(5m, 15m, 30m, 1h, 4h, 1D) is refreshed from that live 1m tail via
`mergeLiveTail`, so a higher timeframe advances with the market between fetches.
Weekly is deliberately excluded: its exchange boundary (the Monday open) is not
the epoch-based bucket, so a rebuild would place the bar at the wrong time.

`mergeLiveTail` also refuses a partial rebuild. A 1m window covers only a few
hours, so the current daily bucket is usually only partly observed; rebuilding
it from that tail would report a high, low and volume for a day that has barely
started. When the base window does not reach the bucket open, the natively
fetched bar is kept instead — real but unadvanced, rather than replaced with a
wrong one.

A timeframe with too few candles to warm up its indicators is reported as
unavailable and does not vote. It is never back-filled.

---

## 3. Every factor that feeds the compass

### Moving averages

SMA and EMA over 5, 10, 20, 50, 100, 200 — twelve factors.

Each votes **Buy** when price is above the average, **Sell** when below, and
**Neutral** inside a tolerance band. The tolerance is `maTolerance` in
`src/config/compass.ts`, expressed as a fraction of price, so a price sitting
fractions of a percent from an average does not cast a false directional vote.

### Technical indicators

Twelve factors, each with a standard threshold:

| Indicator | Buy | Sell |
| --- | --- | --- |
| RSI (14) | < 30 | > 70 |
| Stochastic (9,6) | %K/%D oversold | %K/%D overbought |
| Stochastic RSI (14) | %K/%D oversold | %K/%D overbought |
| MACD (12,26,9) | MACD above signal | MACD below signal |
| ADX (14) with +DI/-DI | +DI > −DI with trend | −DI > +DI with trend |
| Williams %R (14) | ≤ −80 | ≥ −20 |
| CCI (14) | > 100 | < −100 |
| ATR (14) | — | — |
| Highs/Lows (14) | range expanding up | range expanding down |
| Ultimate Oscillator | < 30 | > 70 |
| ROC (12) | positive | negative |
| Bull/Bear Power (13) | bull > bear | bear > bull |

ATR is a volatility measure, not a direction, so it votes Neutral by design. It
is shown because the raw value matters, not because it picks a side.

---

## 4. How the votes are combined

1. The twelve moving-average votes are combined into a **Moving averages** gauge
   using `maWeights`.
2. The twelve indicator votes are combined into a **Technical indicators** gauge
   using `indicatorWeights`.
3. The two gauges are combined into the **Summary** using `blockWeights`.

Each gauge reports a score from −100 to +100 and the count of Buy, Neutral and
Sell votes behind it.

The summary score maps to a label through `labelFromScore`:

| Score | Label |
| --- | --- |
| ≥ +60 | Strong Buy |
| +20 … +59 | Buy |
| −19 … +19 | Neutral |
| −59 … −20 | Sell |
| ≤ −60 | Strong Sell |

There is exactly one function that turns a score into a label, and it is derived
from the score's sign. A positive score cannot read as Sell.

---

## 5. Confluence

The confluence matrix shows every timeframe's reading at once and a weighted
overall bias. Each timeframe's score is weighted by `timeframeWeights`, with the
trend timeframes (1h, 4h, 1D) carrying the most weight, the 1m and 5m
deliberately light, and the weekly a slow confirmation. The matrix also reports
how many timeframes agree and in which direction.

A timeframe with no data is reported as unavailable and does not vote.

The default weights are:

| Timeframe | Weight | Why |
| --- | --- | --- |
| M1 | 0.2 | Entry timing only; far too noisy to carry a trend read |
| M5 | 0.6 | Short-term momentum |
| M15 | 1.0 | The intraday swing |
| M30 | 1.2 | The intraday trend |
| 1H | 1.6 | The trend for an intraday entry |
| 4H | 1.8 | The swing trend |
| 1D | 2.0 | The dominant trend |
| 1W | 1.2 | Slow confirmation |

---

## 6. Entry check

The confluence matrix says what the market is doing. The entry check answers the
next question: **does the market agree with the trade I am about to take?**

You pick LONG or SHORT. Every timeframe's summary is then classified as agreeing,
disagreeing or neutral relative to that direction, and the verdict is one of:

| Verdict | Meaning |
| --- | --- |
| Aligned | The weighted majority agrees and no higher timeframe disagrees |
| Partial | Some agreement, but not enough — or a higher timeframe is fighting |
| Against | The weighted majority disagrees with the direction |

Agreement is weighted by the same `timeframeWeights`, and it is measured only
across timeframes that took a side, so a neutral timeframe neither helps nor
hurts. A single higher-timeframe disagreement (1H and above by default) is enough
to stop the verdict being Aligned and is reported as an explicit warning — that
is the case worth knowing about before entering.

The rules live in the `entryCheck` block of `src/config/compass.ts`:
`higherTimeframes`, `warnOnHigherTimeframeDisagreement`, `alignedShare` and
`againstShare`. The logic is `checkEntry` in `src/core/entryCheck.ts`, pure and
covered by `src/core/__tests__/entryCheck.test.ts`.

---

## 7. When the compass updates

There is no candle-close poll and no manual refresh. Candles are seeded once,
then for crypto one combined WebSocket drives everything live (`@ticker`,
`@kline_1m`, `@depth10@100ms`, `@aggTrade`). High-frequency messages accumulate
in refs and one coalesced snapshot commits to React state every 150 ms, so the
compass moves within a second or two of market activity without a re-render per
trade.

A futures provider serves candles on request; its newest bar is current as of
the last fetch, and the status is reported honestly rather than as a live tick.

---

## 8. Data sources and honesty rules

- **Never fabricate market data.** No random walks, no synthetic order flow, no
  placeholder prices. An unavailable figure reads as unavailable.
- **Order flow must be real.** It is shown only when the provider genuinely has a
  book and tape. A candle-only provider hides the panel with an explanation.
  Order flow is never estimated from candles.
- **Keys stay server-side.** Crypto needs none. The futures provider's key is
  read only by the functions under `api/` and never reaches the browser.
- **Labels follow the score.** One function, derived from the sign, asserted by
  tests.
