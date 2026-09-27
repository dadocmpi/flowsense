import React from 'react';
import { OrderFlowState } from '../../types/trading';
import { cn } from '@/lib/utils';
import { streamStatusLabel } from '../../lib/labels';

interface RealtimeOrderFlowProps {
  orderFlow: OrderFlowState;
  precision: number;
  quote: string;
}

function formatPrice(price: number, precision: number): string {
  return price.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

function formatSize(size: number): string {
  if (size >= 1000) return size.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (size >= 1) return size.toFixed(3);
  return size.toFixed(6);
}

const STREAM_TONE: Record<OrderFlowState['streamStatus'], string> = {
  LIVE: 'text-green-400',
  CONNECTING: 'text-amber-400',
  RECONNECTING: 'text-amber-400',
  OFFLINE: 'text-red-500',
};

/**
 * Real order flow from Binance public streams: top-10 book depth, the
 * aggregated trade tape and the resulting buy/sell split. Every number here
 * comes from the exchange — nothing is estimated.
 */
export const RealtimeOrderFlow: React.FC<RealtimeOrderFlowProps> = ({ orderFlow, precision, quote }) => {
  const { bids, asks, recentTrades, buyersPercent, sellersPercent, cumulativeDelta } = orderFlow;

  const hasBook = bids.length > 0 && asks.length > 0;
  const spread = hasBook ? asks[0].price - bids[0].price : 0;
  const spreadPct = hasBook && bids[0].price > 0 ? (spread / bids[0].price) * 100 : 0;

  const bidDepth = bids.reduce((acc, b) => acc + b.size, 0);
  const askDepth = asks.reduce((acc, a) => acc + a.size, 0);
  const totalDepth = bidDepth + askDepth;
  const bidDepthPct = totalDepth > 0 ? (bidDepth / totalDepth) * 100 : 50;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Real-time order flow</h3>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-white/40">Binance stream:</span>
          <span className={cn('font-bold', STREAM_TONE[orderFlow.streamStatus])}>
            {streamStatusLabel(orderFlow.streamStatus)}
          </span>
        </div>
      </div>

      {recentTrades.length > 0 && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-mono">
            <span className="font-bold text-green-400">Buyers {buyersPercent.toFixed(1)}%</span>
            <span className="font-bold text-red-400">{sellersPercent.toFixed(1)}% sellers</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-red-500/25">
            <div className="h-full bg-green-500" style={{ width: `${buyersPercent}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/40">
            <span>
              Cumulative delta: {cumulativeDelta >= 0 ? '+' : '-'}
              {formatSize(Math.abs(cumulativeDelta))}
            </span>
            {hasBook && (
              <span>
                Spread: {formatPrice(spread, precision)} ({spreadPct.toFixed(3)}%)
              </span>
            )}
          </div>
        </div>
      )}

      {!hasBook && (
        <div className="mb-6 rounded border border-white/[0.06] bg-white/[0.01] px-4 py-6 text-center text-xs text-white/40">
          Order book unavailable — waiting for the depth stream
        </div>
      )}

      {hasBook && (
        <div className="mb-6">
          <h4 className="mb-2 text-xs font-semibold text-white/70">Order book, top 10 levels</h4>
          <div className="overflow-hidden rounded border border-white/[0.04]">
            <div className="flex items-center justify-between bg-white/[0.02] px-4 py-1.5 text-[9px] text-white/30">
              <span className="flex-1 text-left">Price</span>
              <span className="flex-1 text-right">Size</span>
              <span className="flex-1 text-right">Total ({quote})</span>
            </div>

            {[...asks].reverse().map((ask, i) => (
              <div key={`ask-${i}`} className="relative flex items-center justify-between border-t border-white/[0.02] px-4 py-1.5 font-mono text-xs">
                <div className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${ask.percentage}%` }} />
                <span className="relative flex-1 text-left text-red-400">{formatPrice(ask.price, precision)}</span>
                <span className="relative flex-1 text-right text-white/70">{formatSize(ask.size)}</span>
                <span className="relative flex-1 text-right text-white/40">{formatSize(ask.total)}</span>
              </div>
            ))}

            <div className="flex items-center justify-between border-y border-white/[0.06] bg-white/[0.03] px-4 py-2 font-mono text-[10px]">
              <span className="text-white/40">Depth</span>
              <span className="text-green-400">Bid {bidDepthPct.toFixed(1)}%</span>
              <span className="text-red-400">Ask {(100 - bidDepthPct).toFixed(1)}%</span>
            </div>

            {bids.map((bid, i) => (
              <div key={`bid-${i}`} className="relative flex items-center justify-between border-t border-white/[0.02] px-4 py-1.5 font-mono text-xs">
                <div className="absolute inset-y-0 right-0 bg-green-500/10" style={{ width: `${bid.percentage}%` }} />
                <span className="relative flex-1 text-left text-green-400">{formatPrice(bid.price, precision)}</span>
                <span className="relative flex-1 text-right text-white/70">{formatSize(bid.size)}</span>
                <span className="relative flex-1 text-right text-white/40">{formatSize(bid.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold text-white/70">Trade tape</h4>
        {recentTrades.length === 0 ? (
          <div className="rounded border border-white/[0.06] bg-white/[0.01] px-4 py-6 text-center text-xs text-white/40">
            No trades received yet
          </div>
        ) : (
          <div className="max-h-[240px] overflow-y-auto overflow-hidden rounded border border-white/[0.04]">
            <div className="sticky top-0 flex items-center justify-between bg-white/[0.02] px-4 py-1.5 text-[9px] text-white/30">
              <span className="w-20 text-left">Time</span>
              <span className="flex-1 text-right">Price</span>
              <span className="flex-1 text-right">Size</span>
              <span className="w-12 text-right">Side</span>
            </div>
            {recentTrades.map(trade => (
              <div key={trade.id} className="flex items-center justify-between border-t border-white/[0.02] px-4 py-1.5 font-mono text-xs">
                <span className="w-20 text-left text-white/40">{trade.time}</span>
                <span className={cn('flex-1 text-right', trade.type === 'BUY' ? 'text-green-400' : 'text-red-400')}>
                  {formatPrice(trade.price, precision)}
                </span>
                <span className="flex-1 text-right text-white/70">{formatSize(trade.size)}</span>
                <span className={cn('w-12 text-right font-bold', trade.type === 'BUY' ? 'text-green-400' : 'text-red-400')}>
                  {trade.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[10px] text-white/30">
        Source: Binance public streams — ticker, partial book depth and aggregated trades.
      </p>
    </div>
  );
};
