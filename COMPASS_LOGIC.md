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
| Gauge building, score → label, the technical and summary blends | `src/core/scoring.ts` |
| Market structure (swings, BOS, CHoCH, premium/discount) | `src/core/structure.ts` |
| Entry check: do the compasses agree with a long/short? | `src/core/entryCheck.ts` |
| Session open resolution (RTH/FULL, DST-safe) | `src/core/session.ts` |
| ATR, VWAP, session range, point of control | `src/core/metrics.ts` |
| Candle bucketing, resampling, live-tail merge | `src/core/candles.ts` |
| One timeframe → three compasses + structure + metrics | `src/core/timeframeEngine.ts` |
| Entry-check rules (compass weights, agreement shares) | `src/config/compass.ts` |
| Every weight, tolerance and session setting | `src/config/compass.ts` |
| Order-flow provider seam (the `none` adapter) | `src/core/providers/orderflow.ts` |
| Data entry point for one instrument | `src/hooks/useInstrumentFeed.ts` |
| One reading per (asset, timeframe), kept apart | `src/hooks/useTimeframeReadings.ts` |

Everything in `src/core` is pure: no I/O, no clock, no React. That is what makes
it testable without a browser, and it is deliberate — keep it that way.

---

## 2. Timeframes

`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, displayed as
`M1`, `M5`, `M15`, `M30`, `1H`, `4H`, `1D`.

Each timeframe is fetched from the provider at its own interval, not aggregated
from one base series. A 1m seed cannot reach back far enough to fill a daily, so
aggregating everything from 1m would silently leave the higher timeframes empty.

The live stream carries the 1m bar. The newest bar of the mergeable timeframes
(5m, 15m, 30m, 1h, 4h, 1D) is refreshed from that live 1m tail via
`mergeLiveTail`, so a higher timeframe advances with the market between fetches.

`mergeLiveTail` refuses a partial rebuild. A 1m window covers only a few
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

## 5. The three compasses

For the SELECTED timeframe the engine produces three compasses, and the screen
shows them in one row.

| Compass | Built from |
| --- | --- |
| Technical indicators (left) | The moving-average block and the oscillator block, blended on their signed scores |
| Summary (centre) | The technical gauge blended with order flow. With no order-flow source it IS the technical gauge |
| Order flow (right) | delta/CVD, book imbalance and absorption, from a provider — or `null`, and the card says so |

Blending happens on the signed scores, so a neutral block cannot drag a strong
one to the opposite side. The label always comes from `labelFromScore`, so the
needle and the word can never disagree.

Order flow is never computed from candles. A candle has no aggressor side and no
order book, so a candle feed cannot produce a delta. The shipped adapter is
`none`: the card draws no gauge at all rather than a neutral needle, because a
neutral needle reads as a real "neutral market".

---

## 6. Entry check

The compasses say what the market is doing. The entry check answers the next
question: **does the market agree with the trade I am about to take?**

You pick LONG or SHORT. The three compasses of the selected timeframe are then
classified as agreeing, disagreeing or neutral relative to that direction, and
the verdict is one of:

| Verdict | Meaning |
| --- | --- |
| Aligned | The weighted majority of the compasses agrees |
| Mixed | Some agreement, but not enough for a clean read |
| Against | The weighted majority disagrees with the direction |

Agreement is weighted by `compassWeights` and measured only across compasses
that took a side, so a neutral compass neither helps nor hurts. A compass with no
reading — order flow when no source is configured — is reported as unavailable
and excluded, so a missing source can never be mistaken for agreement.

The rules live in the `entryCheck` block of `src/config/compass.ts`:
`compassWeights`, `alignedShare` and `againstShare`. The logic is `checkEntry` in
`src/core/entryCheck.ts`, pure and covered by
`src/core/__tests__/entryCheck.test.ts`.

Under the verdict, a chip row shows every timeframe's stored summary reading and
its age. A chip fills only from a timeframe already loaded in this session; the
rest read "Not loaded" and are never fetched to fill a chip, which is what keeps
a page load at one timeframe's worth of credits.

---

## 7. When the compass updates

There is no candle-close poll and no manual refresh. Candles are seeded with
REST calls, then the provider's live feed carries updates; high-frequency
messages accumulate in refs and one coalesced snapshot commits to React state
every 200 ms, so the compass moves within a second or two of market activity
without a re-render per tick.

The futures provider serves candles on request; its newest bar is current as of
the last fetch, and the status is reported honestly rather than as a live tick.
When the server exposes a browser-safe price stream the price can reach `LIVE`;
otherwise it is polled and labelled "Delayed (polling)".

---

## 8. Data sources and honesty rules

- **Never fabricate market data.** No random walks, no synthetic values, no
  placeholder prices. An unavailable figure reads as unavailable.
- **Keys stay server-side.** The futures provider's key is read only by the
  functions under `api/` and never reaches the browser.
- **Labels follow the score.** One function, derived from the sign, asserted by
  tests.
