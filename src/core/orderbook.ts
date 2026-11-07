// ============================================
// ORDER BOOK PRESSURE
// ============================================
// The RIGHT compass reads the resting ORDER BOOK: the size bid against the size
// offered, plus the traded volume that corroborates it. That data does not exist
// in a candle — a candle carries no bid/ask and no book — so it is NEVER derived
// from the candle feed. It arrives from a provider (an Alpaca snapshot), or the
// card says there is none.
//
// This module is pure: it turns ONE real book snapshot into the pressure
// percentage the card shows and the gauge the summary and the entry check
// consume. No clock, no I/O, no network, and no candle input — so the number can
// never disagree with the book it came from.

import type { GaugeReading, OrderFlowMetrics, OrderFlowReading, VoteDetail } from './types';
import { clampScore, labelFromScore } from './scoring';
import type { CompassConfig } from '../config/compass';

/**
 * One real book snapshot, exactly as the provider reported it. Every field is
 * nullable: a source that cannot supply one says so rather than filling it with
 * a zero, and a book with only one side is not a reading at all.
 */
export interface BookQuote {
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  /** Traded volume over the vendor's reference window (the session), or null. */
  volume: number | null;
  /** Vendor-reported source label, for the provenance line. */
  source: string;
  /** Epoch ms the vendor stamped the quote with, or null. */
  at: number | null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Turn one real book snapshot into a reading, or null when there is nothing
 * honest to read.
 *
 * Null (never a zero) when the book is missing a side or is empty: a fabricated
 * "neutral" 0% would read as a real balanced book, which it is not.
 */
export function buildOrderBookReading(quote: BookQuote, config: CompassConfig): OrderFlowReading | null {
  const bidSize = finiteOrNull(quote.bidSize);
  const askSize = finiteOrNull(quote.askSize);

  // Both sides are required: one side alone, or an empty book, carries no
  // imbalance and must not be dressed as a neutral reading.
  if (bidSize === null || askSize === null) return null;
  const totalSize = bidSize + askSize;
  if (totalSize <= 0) return null;

  const bid = finiteOrNull(quote.bid);
  const ask = finiteOrNull(quote.ask);
  const hasPrices = bid !== null && ask !== null;
  const mid = hasPrices ? (bid + ask) / 2 : null;
  const spread = hasPrices ? ask - bid : null;
  const spreadPercent = mid !== null && mid > 0 && spread !== null ? (spread / mid) * 100 : null;

  const imbalance = (bidSize - askSize) / totalSize;
  const bidSharePercent = (bidSize / totalSize) * 100;

  const volume = finiteOrNull(quote.volume);

  const directional = Math.abs(imbalance) > config.orderBook.neutralBand;
  const score = clampScore(imbalance * 100);

  // Volume is shown alongside the book as corroboration, but it is unsigned: it
  // can strengthen the read, never give it a direction, so it does not touch the
  // pressure percentage. The percentage is the resting book, and nothing else.
  const details: VoteDetail[] = [
    {
      name: 'Book imbalance',
      value: imbalance,
      display: `${bidSharePercent.toFixed(1)}% bid`,
      vote: directional ? (imbalance > 0 ? 'BUY' : 'SELL') : 'NEUTRAL',
      note: `${bidSize.toLocaleString()} bid / ${askSize.toLocaleString()} ask`,
      group: 'ORDER_FLOW',
    },
    {
      name: 'Traded volume',
      value: volume ?? 0,
      display: volume !== null ? volume.toLocaleString() : '--',
      vote: 'NEUTRAL',
      note: volume !== null ? 'session volume corroborates the book' : 'no volume reported',
      group: 'ORDER_FLOW',
    },
    {
      name: 'Bid/ask spread',
      value: spread ?? 0,
      display: spreadPercent !== null ? `${spreadPercent.toFixed(3)}%` : '--',
      vote: 'NEUTRAL',
      group: 'ORDER_FLOW',
    },
  ];

  const gauge: GaugeReading = {
    score,
    label: labelFromScore(score, config),
    tally: {
      buy: directional && imbalance > 0 ? 1 : 0,
      sell: directional && imbalance < 0 ? 1 : 0,
      neutral: directional ? 0 : 1,
    },
    details,
  };

  const metrics: OrderFlowMetrics = {
    bid,
    ask,
    bidSize,
    askSize,
    mid,
    spread,
    spreadPercent,
    bidSharePercent,
    imbalance,
    volume,
  };

  return { gauge, metrics, source: quote.source, at: finiteOrNull(quote.at) };
}
