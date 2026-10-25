// ============================================
// ORDER FLOW PANEL
// ============================================
// Real order flow only. This component is rendered exclusively when the
// provider declares `orderFlow: true`; the caller hides it otherwise, and it
// never derives flow from candles.
//
// Every number here comes from the provider's own order book and tape:
//   depth        the provider's book levels
//   tape         the provider's trades, with the exchange's aggressor flag
//   split        buy vs sell volume accumulated from that tape
//   delta        buy minus sell volume accumulated from that tape

import React from 'react';
import type { OrderFlowSnapshot } from '../../core/providers';
import { cn } from '@/lib/utils';
import { formatNumber } from './format';

interface OrderFlowPanelProps {
  flow: OrderFlowSnapshot;
  precision: number;
  quote: string;
}

const STATUS_TEXT: Record<OrderFlowSnapshot['streamStatus'], string> = {
  CONNECTING: 'Connecting',
  LIVE: 'Live',
  RECONNECTING: 'Reconnecting',
  OFFLINE: 'Offline',
  UNAVAILABLE: 'Unavailable',
};

const STATUS_TONE: Record<OrderFlowSnapshot['streamStatus'], string> = {
  CONNECTING: 'text-amber-400',
  LIVE: 'text-[#26a69a]',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-[#ef5350]',
  UNAVAILABLE: 'text-white/40',
};

function DepthRow({
  price,
  size,
  percentage,
  side,
  precision,
}: {
  price: number;
  size: number;
  percentage: number;
  side: 'bid' | 'ask';
  precision: number;
}) {
  return (
    <div className="relative flex items-center justify-between px-2 py-1 font-mono text-label">
      <div
        className={cn('absolute inset-y-0', side === 'bid' ? 'right-0 bg-[#26a69a]/12' : 'right-0 bg-[#ef5350]/12')}
        style={{ width: `${Math.max(2, Math.min(100, percentage))}%` }}
        aria-hidden
      />
      <span className={cn('relative z-10', side === 'bid' ? 'text-[#4db6ac]' : 'text-[#e57373]')}>
        {formatNumber(price, precision)}
      </span>
      <span className="relative z-10 text-white/70">{formatNumber(size, 4)}</span>
    </div>
  );
}

export const OrderFlowPanel: React.FC<OrderFlowPanelProps> = ({ flow, precision, quote }) => {
  const hasBook = flow.bids.length > 0 || flow.asks.length > 0;
  const hasTape = flow.recentTrades.length > 0;
  const hasSplit = flow.buyerVolume + flow.sellerVolume > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-label">
        <span className={cn('font-bold', STATUS_TONE[flow.streamStatus])}>● {STATUS_TEXT[flow.streamStatus]}</span>
        <span className="text-white/35">
          Real order flow from the provider&rsquo;s own book and tape — never derived from candles.
        </span>
      </div>

      {/* Buy / sell split, accumulated from the real tape */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-label">
          <span className="font-bold text-[#4db6ac]">Buyers {flow.buyersPercent.toFixed(1)}%</span>
          <span className="font-bold text-[#e57373]">Sellers {flow.sellersPercent.toFixed(1)}%</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="bg-[#26a69a] transition-all duration-300"
            style={{ width: `${hasSplit ? flow.buyersPercent : 0}%` }}
          />
          <div
            className="bg-[#ef5350] transition-all duration-300"
            style={{ width: `${hasSplit ? flow.sellersPercent : 0}%` }}
          />
        </div>
        {!hasSplit && (
          <p className="mt-1.5 text-micro italic text-white/35">No trades received on the stream yet.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <span className="block text-micro uppercase tracking-wider text-white/35">Volume delta</span>
          <span className={cn('font-mono text-body font-bold', flow.volumeDelta >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]')}>
            {flow.volumeDelta >= 0 ? '+' : ''}
            {formatNumber(flow.volumeDelta, 4)}
          </span>
          <span className="mt-0.5 block text-micro text-white/30">live tape</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <span className="block text-micro uppercase tracking-wider text-white/35">Cumulative delta</span>
          <span
            className={cn(
              'font-mono text-body font-bold',
              flow.cumulativeDelta >= 0 ? 'text-[#4db6ac]' : 'text-[#e57373]'
            )}
          >
            {flow.cumulativeDelta >= 0 ? '+' : ''}
            {formatNumber(flow.cumulativeDelta, 4)}
          </span>
          <span className="mt-0.5 block text-micro text-white/30">from candle window</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <span className="block text-micro uppercase tracking-wider text-white/35">Buy volume</span>
          <span className="font-mono text-body font-bold text-[#4db6ac]">{formatNumber(flow.buyerVolume, 4)}</span>
          <span className="mt-0.5 block text-micro text-white/30">stream total</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <span className="block text-micro uppercase tracking-wider text-white/35">Sell volume</span>
          <span className="font-mono text-body font-bold text-[#e57373]">{formatNumber(flow.sellerVolume, 4)}</span>
          <span className="mt-0.5 block text-micro text-white/30">stream total</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Order book */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <h4 className="border-b border-white/[0.06] px-3 py-2 text-micro font-semibold uppercase tracking-wider text-white/40">
            Order book depth
          </h4>
          {hasBook ? (
            <div className="p-1">
              <div className="flex justify-between px-2 py-1 text-micro uppercase tracking-wider text-white/30">
                <span>Price</span>
                <span>Size</span>
              </div>
              <div className="flex flex-col-reverse">
                {flow.asks.slice(0, 5).map(ask => (
                  <DepthRow key={`ask-${ask.price}`} {...ask} side="ask" precision={precision} />
                ))}
              </div>
              <div className="my-1 border-y border-white/10 py-1 text-center font-mono text-body font-bold text-white">
                {flow.asks.length > 0 && flow.bids.length > 0
                  ? formatNumber((flow.asks[flow.asks.length - 1].price + flow.bids[0].price) / 2, precision)
                  : '--'}
              </div>
              <div>
                {flow.bids.slice(0, 5).map(bid => (
                  <DepthRow key={`bid-${bid.price}`} {...bid} side="bid" precision={precision} />
                ))}
              </div>
            </div>
          ) : (
            <p className="p-4 text-center text-body italic text-white/40">Waiting for book data…</p>
          )}
        </div>

        {/* Tape */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <h4 className="border-b border-white/[0.06] px-3 py-2 text-micro font-semibold uppercase tracking-wider text-white/40">
            Trade tape
          </h4>
          {hasTape ? (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full border-collapse font-mono text-label">
                <thead className="sticky top-0 bg-[#0b0c10]">
                  <tr className="text-left text-micro uppercase tracking-wider text-white/30">
                    <th className="px-2 py-1 font-semibold">Time</th>
                    <th className="px-2 py-1 text-right font-semibold">Price</th>
                    <th className="px-2 py-1 text-right font-semibold">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.recentTrades.slice(0, 30).map(trade => (
                    <tr key={`${trade.id}-${trade.time}`} className="border-b border-white/[0.03] last:border-0">
                      <td className="px-2 py-1 text-white/40">{trade.time}</td>
                      <td
                        className={cn(
                          'px-2 py-1 text-right font-bold',
                          trade.type === 'BUY' ? 'text-[#4db6ac]' : 'text-[#e57373]'
                        )}
                      >
                        {formatNumber(trade.price, precision)}
                      </td>
                      <td className="px-2 py-1 text-right text-white/70">{formatNumber(trade.size, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-center text-body italic text-white/40">Waiting for trades…</p>
          )}
        </div>
      </div>

      <p className="mt-3 text-micro text-white/30">
        Aggressor side is the exchange&rsquo;s own flag on each trade. {quote} volume is quoted in base units.
      </p>
    </div>
  );
};
