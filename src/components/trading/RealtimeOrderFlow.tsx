import React from 'react';
import { OrderFlowState } from '../../types/trading';
import { cn } from '@/lib/utils';

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

const STREAM_LABEL: Record<OrderFlowState['streamStatus'], { text: string; className: string }> = {
  LIVE: { text: 'LIVE', className: 'text-green-400' },
  CONNECTING: { text: 'CONNECTING', className: 'text-amber-400' },
  RECONNECTING: { text: 'RECONNECTING', className: 'text-amber-400' },
  OFFLINE: { text: 'OFFLINE', className: 'text-red-500' },
};

/**
 * Real order flow from Binance public streams: top-10 book depth, the
 * aggregated trade tape and the resulting buy/sell split. Every number here
 * comes from the exchange — nothing is estimated.
 */
export const RealtimeOrderFlow: React.FC<RealtimeOrderFlowProps> = ({ orderFlow, precision, quote }) => {
  const { bids, asks, recentTrades, buyersPercent, sellersPercent, cumulativeDelta } = orderFlow;
  const status = STREAM_LABEL[orderFlow.streamStatus];

  const hasBook = bids.length > 0 && asks.length > 0;
  const spread = hasBook ? asks[0].price - bids[0].price : 0;
  const spreadPct = hasBook && bids[0].price > 0 ? (spread / bids[0].price) * 100 : 0;

  const bidDepth = bids.reduce((acc, b) => acc + b.size, 0);
  const askDepth = asks.reduce((acc, a) => acc + a.size, 0);
  const totalDepth = bidDepth + askDepth;
  const bidDepthPct = totalDepth > 0 ? (bidDepth / totalDepth) * 100 : 50;

  return (
    <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-white font-bold flex items-center">
          <span className="w-4 h-4 bg-amber-400 rounded mr-2" />
          Real-Time Order Flow
        </h3>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-white/40">BINANCE STREAM:</span>
          <span className={cn('font-black', status.className)}>{status.text}</span>
        </div>
      </div>

      {!hasBook && (
        <div className="mb-6 rounded border border-white/[0.06] bg-white/[0.01] px-4 py-6 text-center text-xs text-white/40 font-mono">
          ORDER BOOK UNAVAILABLE — waiting for the depth stream
        </div>
      )}

      {hasBook && (
        <>
          {/* Buy/sell split from the live trade tape */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
              <span className="text-green-400 font-bold">BUYERS {buyersPercent.toFixed(1)}%</span>
              <span className="text-red-400 font-bold">{sellersPercent.toFixed(1)}% SELLERS</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-red-500/25 flex">
              <div className="bg-green-500 h-full" style={{ width: `${buyersPercent}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-white/40">
              <span>Cumulative delta (300 candles): {cumulativeDelta >= 0 ? '+' : '-'}{formatSize(Math.abs(cumulativeDelta))}</span>
              <span>Spread: {formatPrice(spread, precision)} ({spreadPct.toFixed(3)}%)</span>
            </div>
          </div>

          {/* Order book */}
          <div className="mb-6">
            <h4 className="text-white/70 font-semibold text-xs mb-2">Order Book (Top 10 Levels)</h4>
            <div className="overflow-hidden rounded border border-white/[0.04]">
              <div className="flex items-center justify-between px-4 py-1.5 text-[9px] font-mono text-white/30 bg-white/[0.02]">
                <span className="flex-1 text-left">PRICE</span>
                <span className="flex-1 text-right">SIZE</span>
                <span className="flex-1 text-right">TOTAL ({quote})</span>
              </div>

              {[...asks].reverse().map((ask, i) => (
                <div key={`ask-${i}`} className="relative flex items-center justify-between px-4 py-1.5 text-xs font-mono border-t border-white/[0.02]">
                  <div className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${ask.percentage}%` }} />
                  <span className="relative flex-1 text-left text-red-400">{formatPrice(ask.price, precision)}</span>
                  <span className="relative flex-1 text-right text-white/70">{formatSize(ask.size)}</span>
                  <span className="relative flex-1 text-right text-white/40">{formatSize(ask.total)}</span>
                </div>
              ))}

              <div className="flex items-center justify-between px-4 py-2 text-[10px] font-mono bg-white/[0.03] border-y border-white/[0.06]">
                <span className="text-white/40">DEPTH</span>
                <span className="text-green-400">BID {bidDepthPct.toFixed(1)}%</span>
                <span className="text-red-400">ASK {(100 - bidDepthPct).toFixed(1)}%</span>
              </div>

              {bids.map((bid, i) => (
                <div key={`bid-${i}`} className="relative flex items-center justify-between px-4 py-1.5 text-xs font-mono border-t border-white/[0.02]">
                  <div className="absolute inset-y-0 right-0 bg-green-500/10" style={{ width: `${bid.percentage}%` }} />
                  <span className="relative flex-1 text-left text-green-400">{formatPrice(bid.price, precision)}</span>
                  <span className="relative flex-1 text-right text-white/70">{formatSize(bid.size)}</span>
                  <span className="relative flex-1 text-right text-white/40">{formatSize(bid.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Trade tape */}
      <div>
        <h4 className="text-white/70 font-semibold text-xs mb-2">
          Trade Tape <span className="text-white/30 font-normal">({recentTrades.length} recent)</span>
        </h4>
        {recentTrades.length === 0 ? (
          <div className="rounded border border-white/[0.06] bg-white/[0.01] px-4 py-6 text-center text-xs text-white/40 font-mono">
            NO TRADES RECEIVED YET
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-white/[0.04] max-h-[240px] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-1.5 text-[9px] font-mono text-white/30 bg-white/[0.02] sticky top-0">
              <span className="w-20 text-left">TIME</span>
              <span className="flex-1 text-right">PRICE</span>
              <span className="flex-1 text-right">SIZE</span>
              <span className="w-12 text-right">SIDE</span>
            </div>
            {recentTrades.map(trade => (
              <div key={trade.id} className="flex items-center justify-between px-4 py-1.5 text-xs font-mono border-t border-white/[0.02]">
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

      <p className="mt-4 text-[10px] text-white/30 font-mono">
        Source: Binance public streams — ticker, partial book depth and aggregated trades.
      </p>
    </div>
  );
};
