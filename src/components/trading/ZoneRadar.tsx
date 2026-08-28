import React from 'react';
import { ConfluenceZone } from '@/lib/context-engine';
import { fmtPrice, fmtDistance } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Layers, Zap, TrendingUp, TrendingDown } from 'lucide-react';

interface ZoneRadarProps {
  zones: ConfluenceZone[];
  currentPrice: number;
  precision?: number;
}

export const ZoneRadar: React.FC<ZoneRadarProps> = ({ zones, currentPrice, precision = 2 }) => {
  if (!zones || zones.length === 0) {
    return (
      <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-6 flex flex-col items-center justify-center h-full min-h-[280px]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
            <Layers size={20} className="text-white/30" />
          </div>
          <p className="text-[11px] text-white/40 font-medium">No institutional zones detected</p>
          <p className="text-[9px] text-white/25 mt-1">Building zone map from market data...</p>
        </div>
      </div>
    );
  }

  // Separate zones above and below price
  const above = zones.filter(z => z.mid > currentPrice).slice(0, 3);
  const below = zones.filter(z => z.mid <= currentPrice).slice(0, 3);

  return (
    <div className="bg-[#0b0c10] rounded-3xl border border-white/[0.06] p-5 flex flex-col h-full shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center space-x-2">
          <Layers size={12} className="text-amber-400" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Zone Radar</span>
        </div>
        <span className="text-[9px] text-white/30 font-mono">{zones.length} active zones</span>
      </div>

      {/* Current Price */}
      <div className="flex items-center justify-between mb-4 bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5">
        <span className="text-[9px] font-black text-white/40 uppercase tracking-wider">Current Price</span>
        <span className="text-base font-black font-mono text-white">${fmtPrice(currentPrice, precision)}</span>
      </div>

      <div className="flex-grow space-y-3 overflow-y-auto">
        
        {/* Zones ABOVE price */}
        <div>
          <div className="flex items-center space-x-1.5 mb-2">
            <ChevronUp size={10} className="text-[#ef5350]" />
            <span className="text-[8px] font-black text-[#ef5350]/70 uppercase tracking-widest">Resistance Above</span>
          </div>
          {above.length === 0 ? (
            <div className="text-[9px] text-white/20 italic pl-3">No zones above</div>
          ) : (
            <div className="space-y-1.5">
              {above.map(zone => (
                <ZoneRow key={zone.id} zone={zone} currentPrice={currentPrice} precision={precision} direction="above" />
              ))}
            </div>
          )}
        </div>

        {/* Zones BELOW price */}
        <div>
          <div className="flex items-center space-x-1.5 mb-2">
            <ChevronDown size={10} className="text-[#26a69a]" />
            <span className="text-[8px] font-black text-[#26a69a]/70 uppercase tracking-widest">Support Below</span>
          </div>
          {below.length === 0 ? (
            <div className="text-[9px] text-white/20 italic pl-3">No zones below</div>
          ) : (
            <div className="space-y-1.5">
              {below.map(zone => (
                <ZoneRow key={zone.id} zone={zone} currentPrice={currentPrice} precision={precision} direction="below" />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

const ZoneRow: React.FC<{
  zone: ConfluenceZone;
  currentPrice: number;
  precision: number;
  direction: 'above' | 'below';
}> = ({ zone, currentPrice, precision, direction }) => {
  const dist = Math.abs(zone.mid - currentPrice);
  const isBullish = zone.direction === 'BULLISH';
  const isBearish = zone.direction === 'BEARISH';

  const confluenceLabel = zone.confluenceCount >= 3 ? 'HIGH' : zone.confluenceCount >= 2 ? 'MEDIUM' : 'LOW';
  const strengthPct = Math.round(zone.totalStrength * 100);

  return (
    <div className={cn(
      "relative bg-white/[0.02] border rounded-xl p-3 overflow-hidden",
      direction === 'above' ? 'border-[#ef5350]/15' : 'border-[#26a69a]/15'
    )}>
      {/* Distance bar */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl",
        direction === 'above' ? 'bg-[#ef5350]/50' : 'bg-[#26a69a]/50'
      )} />

      <div className="pl-2">
        {/* Price range */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-black font-mono text-white">
            ${fmtPrice(zone.low, precision)} – ${fmtPrice(zone.high, precision)}
          </span>
          <span className={cn(
            "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider",
            direction === 'above' ? 'bg-[#ef5350]/10 text-[#ef5350]' : 'bg-[#26a69a]/10 text-[#26a69a]'
          )}>
            {fmtDistance(dist, precision)}
          </span>
        </div>

        {/* Sources */}
        <div className="flex items-center space-x-1 mb-1 flex-wrap">
          {zone.sources.map(src => (
            <span key={src} className="text-[8px] font-bold text-white/40 bg-white/[0.03] px-1 py-0.5 rounded uppercase tracking-tighter">
              {src.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        {/* Meta */}
        <div className="flex items-center space-x-3 text-[9px]">
          <span className={cn(
            "font-black",
            confluenceLabel === 'HIGH' ? 'text-amber-400' :
            confluenceLabel === 'MEDIUM' ? 'text-white/60' : 'text-white/30'
          )}>
            {confluenceLabel} CONFLUENCE
          </span>
          <span className="text-white/30">STR: {strengthPct}%</span>
          <span className={cn(
            "font-black uppercase",
            zone.status === 'ACTIVE' ? 'text-[#26a69a]/70' :
            zone.status === 'TESTED' ? 'text-amber-400/70' :
            zone.status === 'INVALIDATED' ? 'text-[#ef5350]/70' : 'text-white/30'
          )}>
            {zone.status}
          </span>
        </div>
      </div>
    </div>
  );
};