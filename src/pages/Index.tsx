import React, { useState, useMemo } from 'react';
import { useCompassSignal } from '../hooks/useCompassSignal';
import { CompassDisplay } from '../components/compass/CompassDisplay';
import { MarketSummary } from '../components/compass/MarketSummary';
import { ActionPlanningPanel } from '../components/compass/ActionPlanningPanel';
import { SUPPORTED_ASSETS } from '../types/trading';
import { cn } from '@/lib/utils';

const Index = () => {
  const [selectedAsset, setSelectedAsset] = useState('MGC1!');
  const [activeTab, setActiveTab] = useState<'factors' | 'technical' | 'macro' | 'history'>('factors');

  const compass = useCompassSignal();

  const activeConfig = SUPPORTED_ASSETS.find(asset => asset.symbol === selectedAsset) || SUPPORTED_ASSETS[0];
  const displayNameMap: Record<string, string> = {
    'MGC1!': 'GOLD',
    'ES1!': 'SP500'
  };

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-white font-sans flex flex-col selection:bg-amber-500/30">
      {/* Header */}
      <header className="w-full border-b border-white/[0.04] bg-[#07080a] px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center space-x-4">
          {SUPPORTED_ASSETS.map(asset => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset.symbol)}
              className={cn(
                "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all",
                selectedAsset === asset.symbol
                  ? "bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)]"
                  : "bg-white/[0.02] text-white/60 hover:text-white border border-white/[0.04] hover:bg-white/[0.03]"
              )}
            >
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                {displayNameMap[asset.symbol] || asset.symbol}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-white/50">DATA:</span>
            <span className={cn(
              "font-black",
              compass.dataLabel === 'LIVE' ? "text-green-400" :
              compass.dataLabel === 'DELAYED' ? "text-amber-400" :
              "text-white/60"
            )}>
              {compass.dataLabel}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-white/50">LAST:</span>
            <span className="text-white/90">
              {compass.official ? new Date(compass.official.timestamp).toLocaleTimeString() : '--:--'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-8 max-w-[1920px] w-full mx-auto flex flex-col space-y-8">
        {/* Compass Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Compass - Dominant */}
          <div className="lg:col-span-5 flex flex-col">
            <CompassDisplay
              direction={compass.official?.direction || compass.live?.rawDirection || 'NEUTRAL'}
              score={compass.official?.score || compass.live?.rawScore || 50}
              confidence={compass.official?.confidence || 50}
              timestamp={compass.official?.timestamp || Date.now()}
              dataLabel={compass.dataLabel}
              secondsUntilNextUpdate={compass.secondsUntilNextUpdate}
              minutesSinceLastSignal={compass.minutesSinceLastSignal}
              factorSummary={compass.official?.factorSummary || compass.live?.factors.map(f => `${f.name}: ${f.direction}`) || []}
              isStale={compass.official?.isStale || false}
              reason={compass.official?.reason || ''}
            />
          </div>

          {/* Side Panel */}
          <div className="lg:col-span-7 flex flex-col space-y-8">
            {/* Market Summary */}
            <MarketSummary
              marketRegime={compass.official?.marketRegime || 'UNKNOWN'}
              dataQuality={compass.official?.dataQuality || 50}
              dataLabel={compass.dataLabel}
              factorAgreement={compass.live?.factorAgreement || 0}
              price={compass.live?.price || 0}
              timestamp={compass.live?.timestamp || Date.now()}
            />

            {/* Action Planning */}
            <ActionPlanningPanel
              direction={compass.official?.direction || 'NEUTRAL'}
              price={compass.live?.price || 0}
              confidence={compass.official?.confidence || 50}
              marketRegime={compass.official?.marketRegime || 'UNKNOWN'}
              dataQuality={compass.official?.dataQuality || 50}
            />
          </div>
        </div>

        {/* Expandable Details Sections */}
        <div className="bg-[#0b0c10] rounded-2xl border border-white/[0.08] overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex border-b border-white/[0.04]">
            {[
              { id: 'factors', label: 'MARKET FACTORS' },
              { id: 'technical', label: 'TECHNICAL DETAILS' },
              { id: 'macro', label: 'MACRO & FUNDAMENTAL' },
              { id: 'history', label: 'SIGNAL HISTORY' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex-1 px-6 py-4 text-xs font-black tracking-wider transition-all border-b-2",
                  activeTab === tab.id
                    ? "border-amber-400 text-amber-400 bg-amber-500/5"
                    : "border-transparent text-white/40 hover:text-white/60"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'factors' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Market Factors</h3>
                {compass.live?.factors.map((factor, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <div className="flex items-center space-x-4">
                      <span className="text-white/50 text-xs font-black uppercase">{factor.category}</span>
                      <span className="text-white font-mono">{factor.name}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={cn(
                        "font-mono font-bold text-sm",
                        factor.direction === 'BULLISH' ? "text-green-400" :
                        factor.direction === 'BEARISH' ? "text-red-500" :
                        "text-amber-400"
                      )}>
                        {factor.direction}
                      </span>
                      <span className="text-white/50 font-mono text-sm">{factor.weight}%</span>
                    </div>
                  </div>
                ))}
                {(!compass.live?.factors || compass.live.factors.length === 0) && (
                  <div className="text-center text-white/50 italic py-8">
                    No factors available — waiting for data
                  </div>
                )}
              </div>
            )}

            {activeTab === 'technical' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Technical Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-black uppercase">Market State</span>
                    <div className="text-white font-mono mt-2">{compass.official?.marketRegime || 'UNKNOWN'}</div>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-black uppercase">Data Quality</span>
                    <div className={cn(
                      "font-mono mt-2",
                      compass.official?.dataQuality >= 80 ? "text-green-400" :
                      compass.official?.dataQuality >= 60 ? "text-amber-400" : "text-red-500"
                    )}>
                      {compass.official?.dataQuality || 0}%
                    </div>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-black uppercase">Factor Agreement</span>
                    <div className="text-white font-mono mt-2">{compass.live?.factorAgreement || 0}%</div>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                    <span className="text-white/50 text-xs font-black uppercase">Available Factors</span>
                    <div className="text-white font-mono mt-2">
                      {compass.live?.availableFactors || 0} / {compass.live?.totalFactors || 0}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'macro' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Macro & Fundamental Context</h3>
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <span className="text-white/50 text-xs font-black uppercase">Data Source</span>
                  <div className="text-white font-mono mt-2">
                    {compass.dataLabel === 'LIVE' ? 'Live WebSocket' :
                     compass.dataLabel === 'DELAYED' ? 'Delayed REST API' :
                     'Cached / Simulated'}
                  </div>
                </div>
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <span className="text-white/50 text-xs font-black uppercase">Signal Validity</span>
                  <div className="text-white font-mono mt-2">
                    {compass.official?.isStale ? '⚠ Stale — verify data freshness' : '✓ Valid'}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4">
                <h3 className="text-white font-bold mb-4">Signal History</h3>
                {compass.history.length === 0 ? (
                  <div className="text-center text-white/50 italic py-8">
                    No signals yet — waiting for first official minute boundary
                  </div>
                ) : (
                  <div className="space-y-2">
                    {compass.history.slice(-10).reverse().map((entry, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                        <div className="flex items-center space-x-4">
                          <span className={cn(
                            "font-mono font-bold text-sm",
                            entry.direction === 'STRONG_BUY' || entry.direction === 'BUY' ? "text-green-400" :
                            entry.direction === 'STRONG_SELL' || entry.direction === 'SELL' ? "text-red-500" :
                            "text-amber-400"
                          )}>
                            {entry.direction.replace('_', ' ')}
                          </span>
                          <span className="text-white/50 font-mono text-sm">{entry.minuteKey}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-white/50 font-mono text-sm">{entry.score}</span>
                          <span className="text-white/50 font-mono text-sm">{entry.confidence}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;