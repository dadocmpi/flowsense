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
| Gauge building, score → label, overall bias | `src/core/scoring.ts` |
| Entry check: does the market agree with a long/short? | `src/core/entryCheck.ts` |
| Candle bucketing, resampling, live-tail merge | `src/core/candles.ts` |
| One timeframe → gauges + blended summary | `src/core/timeframeEngine.ts` |
| Every timeframe + the overall bias | `src/core/multiTimeframe.ts` |
| Entry-check rules (higher timeframes, thresholds) | `src/config/compass.ts` |
| Every weight, tolerance and session setting | `src/config/compass.ts` |
| Data entry point for one instrument | `src/hooks/useInstrumentFeed.ts` |
| Runs the multi-timeframe engine | `src/hooks/useMultiTimeframeCompass.ts` |

Everything in `src/core` is pure: no I/O, no clock, no React. That is what makes
it testable without a browser, and it is deliberate — keep it that way.

---

## 2. Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, displayed as
`M1`, `M5`, `M15`, `M30`, `1H`, `4H`, `1D`. There is no weekly.

Each timeframe is fetched from the provider at its own interval, not aggregated
from one base series. A 1m seed cannot reach back far enough to fill a daily, so
aggregating everything from 1m would silently leave the higher timeframes empty.

A timeframe with too few candles to warm up its indicators is reported as
unavailable and does not vote. It is never back-filled.

---

## 3. Every factor that feeds the compass

### Moving averages

SMA and EMA over 5, 10, 20, 50, 100, 200 — twelve factors.

Each votes **Buy** when price is above the average, **Sell** when below, and
**Neutral** inside a tolerance band. The tolerance is `maTolerancePercent` in
`src/config/compass.ts`, expressed as a percentage of price, so a price sitting
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
is present as a context reading, not because it picks a side.

Only the blended summary is displayed; the individual votes exist inside the
scoring logic.

---

## 4. How the votes are combined

1. The twelve moving-average votes are combined into a **moving averages** gauge
   using `maWeights`.
2. The twelve indicator votes are combined into an **indicators** gauge using
   `indicatorWeights`.
3. The two gauges are combined into the **summary** using `gaugeBlend`.

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

## 5. The overall bias

The compass shows one timeframe at a time; the left list shows all seven with
their labels and scores, plus an overall bias line. The bias is the weighted
combination of every timeframe's summary score, using `timeframeWeights`, with
the trend timeframes (1h, 4h, 1D) carrying the most weight, the 1m and 5m
deliberately light. The line also reports how many timeframes agree with the
bias and in which direction.

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

---

## 6. Entry check

The compass says what the market is doing. The entry check answers the next
question: **does the market agree with the trade I am about to take?**

You pick LONG or SHORT. Every timeframe's summary is then classified as agreeing,
disagreeing or neutral relative to that direction, and the verdict is one of:

| Verdict | Meaning |
| --- | --- |
| ALIGNED | At least 5 of 7 timeframes agree and no higher timeframe disagrees |
| PARTIAL | Some agreement, but not enough — or a higher timeframe is fighting |
| AGAINST | At most 3 agree, or most higher timeframes disagree |

Neutral counts as not agreeing but is never shown as disagreeing. A single
higher-timeframe disagreement (1H and above by default) is enough to stop the
verdict being ALIGNED and is reported as an explicit warning — that is the case
worth knowing about before entering.

The rules live in the `entryCheck` block of `src/config/compass.ts`:
`higherTimeframes`, `minAligned`, `maxAlignedForAgainst` and
`warnOnHigherTimeframeDisagreement`. The logic is `checkEntry` in
`src/core/entryCheck.ts`, pure and covered by
`src/core/__tests__/entryCheck.test.ts`.

---

## 7. When the compass updates

There is no candle-close poll and no manual refresh. The provider serves candles
on request; the newest bar is current as of the last fetch, and the status is
reported honestly rather than as a live tick.

---

## 8. Data sources and honesty rules

- **Never fabricate market data.** No random walks, no synthetic series, no
  placeholder prices. An unavailable figure reads as unavailable.
- **Keys stay server-side.** The futures provider's key is read only by the
  functions under `api/` and never reaches the browser.
- **Labels follow the score.** One function, derived from the sign, asserted by
  tests.
