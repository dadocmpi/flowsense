import React from 'react';
import { TwelveDataState } from '../../types/trading';
import { cn } from '@/lib/utils';

interface SmartSignalValidatorProps {
  data: TwelveDataState;
  config: {
    direction: 'BUY' | 'SELL';
    startTime: string;
    endTime: string;
    minPrice: number;
    maxPrice: number;
    stopLoss: number;
    takeProfit: number;
  };
  precision: number;
}

const SmartSignalValidator: React.FC<SmartSignalValidatorProps> = ({
  data,
  config,
  precision
}) => {
  // Calculate validation scores (0-100 for each category)
  const zoneScore = calculateZoneScore(data, config);
  const timeScore = calculateTimeScore(config);
  const technicalScore = calculateTechnicalScore(data);
  const orderFlowScore = calculateOrderFlowScore(data, config.direction);
  const volumeScore = calculateVolumeScore(data);
  
  // Weighted total score (can adjust weights based on importance)
  const totalScore = Math.round(
    zoneScore * 0.25 + 
    timeScore * 0.15 + 
    technicalScore * 0.25 + 
    orderFlowScore * 0.20 + 
    volumeScore * 0.15
  );
  
  // Determine if we have a valid signal (user wants >80% confluence)
  const isValidSignal = totalScore >= 80;
  
  // Determine signal direction based on zone config and confirmation
  const signalDirection = config.direction;
  
  // Generate detailed reasoning
  const reasoning = generateReasoning({
    zoneScore,
    timeScore,
    technicalScore,
    orderFlowScore,
    volumeScore,
    totalScore,
    config,
    data
  });
  
  return (
    <div className={cn(
      "p-6 rounded-2xl border border-white/[0.08] text-center",
      isValidSignal 
        ? signalDirection === 'BUY' 
          ? "bg-[#26a69a]/20 border-[#26a69a]/40 shadow-[0_0_25px_rgba(38,166,154,0.3)]" 
          : "bg-[#ef5350]/20 border-[#ef5350]/40 shadow-[0_0_25px_rgba(239,83,80,0.3)]"
        : "bg-white/[0.02] border-white/[0.04]"
    )}>
      {/* Signal Header */}
      <div className="mb-4">
        {isValidSignal ? (
          <>
            <div className="flex items-center justify-center mb-2">
              <div className="w-3 h-3 rounded-full 
                {signalDirection === 'BUY' ? 'bg-[#26a69a]' : 'bg-[#ef5350]'}"
                animate-pulse
              />
              <span className="ml-2 text-[12px] font-black text-white/90 uppercase tracking-wider">
                {signalDirection === 'BUY' ? 'SINAL DE COMPRA VALIDADO' : 'SINAL DE VENDA VALIDADO'}
              </span>
            </div>
            <div className="text-[14px] font-black text-white/90 mb-2">
              CONFLUÊNCIA INSTITUCIONAL: {totalScore}%
            </div>
          </>
        ) : (
          <div className="text-[12px] font-black text-white/60">
            AGUARDANDO CONFLUÊNCIA... ({totalScore}%)
          </div>
        )}
      </div>
      
      {/* Signal Details */}
      {isValidSignal && (
        <div className="space-y-3 text-left">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/70">ZONA:</span>
            <span className="font-mono text-white/90">
              {zoneScore}% {zoneScore >= 70 ? '✓' : '✗'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/70">HORÁRIO:</span>
            <span className="font-mono text-white/90">
              {timeScore}% {timeScore >= 70 ? '✓' : '✗'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/70">TÉCNICA:</span>
            <span className="font-mono text-white/90">
              {technicalScore}% {technicalScore >= 70 ? '✓' : '✗'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/70">FLUXO:</span>
            <span className="font-mono text-white/90">
              {orderFlowScore}% {orderFlowScore >= 70 ? '✓' : '✗'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/70">VOLUME:</span>
            <span className="font-mono text-white/90">
              {volumeScore}% {volumeScore >= 70 ? '✓' : '✗'}
            </span>
          </div>
        </div>
      )}
      
      {/* Entry Levels */}
      {isValidSignal && (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <div className="text-[11px] font-black text-white/70 mb-2">NÍVEIS DE ENTRADA</div>
          <div className="grid grid-cols-2 gap-2 text-[12px] font-mono">
            <div>
              <span className="text-white/60">Entrada:</span>
              <span className="text-white/90 block">${
                data.price.toFixed(precision)
              }</span>
            </div>
            <div>
              <span className="text-white/60">Stop:</span>
              <span className={cn(
                "text-white/90 block",
                config.direction === 'BUY' ? "text-[#ef5350]" : "text-[#26a69a]"
              )} block>${
                config.stopLoss.toFixed(precision)
              }</span>
            </div>
            <div>
              <span className="text-white/60">Alvo:</span>
              <span className={cn(
                "text-white/90 block",
                config.direction === 'BUY' ? "text-[#26a69a]" : "text-[#ef5350]"
              )} block>${
                config.takeProfit.toFixed(precision)
              }</span>
            </div>
            <div>
              <span className="text-white/60">R:R:</span>
              <span className="text-white/90 block">
                {Math.abs((config.takeProfit - data.price) / (data.price - config.stopLoss)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Warning when not valid */}
      {!isValidSignal && totalScore > 0 && (
        <div className="mt-3 text-[10px] font-black text-white/50">
          Faltando: {getMissingFactors({
            zoneScore,
            timeScore,
            technicalScore,
            orderFlowScore,
            volumeScore
          })}
        </div>
      )}
    </div>
  );
};

// Helper functions for scoring
function calculateZoneScore(data: TwelveDataState, config: any): number {
  if (!config.minPrice || !config.maxPrice || config.minPrice >= config.maxPrice) return 0;
  
  // Price position within zone (0-100%)
  const zoneRange = config.maxPrice - config.minPrice;
  const pricePosition = (data.price - config.minPrice) / zoneRange;
  
  // Ideal entry is near the beginning of the zone move
  // For BUY zone: want price near min (support)
  // For SELL zone: want price near max (resistance)
  let positionScore = 0;
  if (config.direction === 'BUY') {
    // For BUY zone, score higher when price is near min (0-30% of zone)
    positionScore = pricePosition <= 0.3 ? 100 : 
                   pricePosition <= 0.5 ? 80 - (pricePosition - 0.3) * 200 : 
                   Math.max(0, 40 - (pricePosition - 0.5) * 100);
  } else {
    // For SELL zone, score higher when price is near max (70-100% of zone)
    positionScore = pricePosition >= 0.7 ? 100 : 
                   pricePosition >= 0.5 ? 80 - (0.7 - pricePosition) * 200 : 
                   Math.max(0, 40 - (0.5 - pricePosition) * 100);
  }
  
  // Depth of penetration into zone (how well price respects zone)
  // If price is respecting zone boundaries, score higher
  const zoneRespectScore = data.price >= config.minPrice && data.price <= config.maxPrice ? 100 : 0;
  
  return Math.round((positionScore * 0.6 + zoneRespectScore * 0.4));
}

function calculateTimeScore(config: any): number {
  if (!config.startTime || !config.endTime) return 0;
  
  try {
    const now = new Date();
    const [startH, startM] = config.startTime.split(':').map(Number);
    const [endH, endM] = config.endTime.split(':').map(Number);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM);
    
    // Score based on how far we are into the trading window
    const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    const elapsedMinutes = (now.getTime() - start.getTime()) / (1000 * 60);
    
    if (elapsedMinutes < 0) return 0; // Before start
    if (elapsedMinutes > totalMinutes) return 0; // After end
    
    // Prefer entering in first 2/3 of session for better follow-through
    const progress = elapsedMinutes / totalMinutes;
    if (progress <= 0.67) return 100;
    if (progress <= 0.8) return 80;
    return Math.max(0, 60 - (progress - 0.8) * 200);
  } catch (e) {
    return 0;
  }
}

function calculateTechnicalScore(data: TwelveDataState): number {
  // Score based on overall confluence and specific indicator alignment
  const baseScore = data.overallSummary.score;
  
  // Bonus for strong alignments in key areas
  let bonus = 0;
  
  // Check moving averages alignment
  const maBullish = data.movingAverages.filter(ma => 
    ma.action === 'BUY' || ma.action === 'STRONG BUY'
  ).length;
  const maBearish = data.movingAverages.filter(ma => 
    ma.action === 'SELL' || ma.action === 'STRONG SELL'
  ).length;
  
  if (maBullish >= 3) bonus += 10; // Strong bullish MA alignment
  if (maBearish >= 3) bonus += 10; // Strong bearish MA alignment
  
  // Check oscillator alignment (avoid extremes)
  const rsi = parseFloat(data.oscillators.find(o => o.name === 'RSI (14)')?.value || '50');
  if (rsi > 30 && rsi < 70) bonus += 5; // RSI in healthy range
  
  // Check momentum
  const momentum = parseFloat(data.oscillators.find(o => o.name === 'Price Momentum')?.value || '0');
  if (Math.abs(momentum) > 0.5) bonus += 5; // Non-zero momentum
  
  return Math.min(100, baseScore + bonus);
}

function calculateOrderFlowScore(data: TwelveDataState, zoneDirection: 'BUY' | 'SELL'): number {
  let score = 0;
  
  // Institutional pressure score
  const pressureMap: {[key: string]: number} = {
    'LOW': 20,
    'MEDIUM': 50,
    'HIGH': 80,
    'EXTREME': 100
  };
  score += pressureMap[data.institutionalPressure] || 0;
  
  // Order flow indicators alignment
  const flowSignals = data.orderFlowIndicators;
  let bullishCount = 0;
  let bearishCount = 0;
  
  flowSignals.forEach(signal => {
    if (signal.action.includes('BUY')) {
      bullishCount += signal.action === 'STRONG BUY' ? 2 : 1;
    }
    if (signal.action.includes('SELL')) {
      bearishCount += signal.action === 'STRONG SELL' ? 2 : 1;
    }
  });
  
  // Score based on dominant direction matching zone direction
  if (zoneDirection === 'BUY') {
    score += Math.min(30, bullishCount * 10);
  } else {
    score += Math.min(30, bearishCount * 10);
  }
  
  // Volume delta confirmation
  const delta = Math.abs(data.volumeDelta);
  if (delta > 500) score += 20;
  else if (delta > 200) score += 10;
  
  return Math.min(100, score);
}

function calculateVolumeScore(data: TwelveDataState): number {
  // Score based on volume characteristics
  let score = 50; // Base score
  
  // Volume participation (buyers vs sellers balance)
  const total = data.buyersPercent + data.sellersPercent;
  if (total > 0) {
    const imbalance = Math.abs(data.buyersPercent - data.sellersPercent) / total * 100;
    // Higher imbalance = stronger conviction
    score += Math.min(30, imbalance * 0.3);
  }
  
  # Volume consistency (check recent trades)
  const recentBuys = data.recentTrades.filter(t => t.type === 'BUY').length;
  const recentSells = data.recentTrades.filter(t => t.type === 'SELL').length;
  const totalTrades = recentBuys + recentSells;
  
  if (totalTrades > 0) {
    const buyRatio = recentBuys / totalTrades;
    // Consistent directional flow
    if (buyRatio > 0.7 || buyRatio < 0.3) score += 20;
  }
  
  return Math.min(100, score);
}

function generateReasoning(params: any): string[] {
  const reasons = [];
  
  if (params.zoneScore >= 70) {
    reasons.push("Preço bem posicionado na zona institucional");
  } else if (params.zoneScore > 0) {
    reasons.push("Preço na zona, mas posição poderia ser melhor");
  }
  
  if (params.timeScore >= 70) {
    reasons.push("Horário ideal para entrada institucional");
  } else if (params.timeScore > 0) {
    reasons.push("Fora do horário ótimo, mas ainda dentro da sessão");
  }
  
  if (params.technicalScore >= 70) {
    reasons.push("Análise técnica fortemente alinhada");
  } else if (params.technicalScore > 0) {
    reasons.push("Algum suporte técnico presente");
  }
  
  if (params.orderFlowScore >= 70) {
    reasons.push("Fluxo institucional confirmando direção");
  } else if (params.orderFlowScore > 0) {
    reasons.push("Algum fluxo institucional detectado");
  }
  
  if (params.volumeScore >= 70) {
    reasons.push("Volume e participação confirmando força");
  } else if (params.volumeScore > 0) {
    reasons.push("Volume mostrando alguma participação");
  }
  
  if (reasons.length === 0) {
    reasons.push("Aguardando confluência mínima necessária");
  }
  
  return reasons;
}

function getMissingFactors(scores: any): string[] {
  const missing = [];
  const threshold = 70;
  
  if (scores.zoneScore < threshold) missing.push("Zona");
  if (scores.timeScore < threshold) missing.push("Horário");
  if (scores.technicalScore < threshold) missing.push("Técnica");
  if (scores.orderFlowScore < threshold) missing.push("Fluxo");
  if (scores.volumeScore < threshold) missing.push("Volume");
  
  return missing.join(', ');
}

export default SmartSignalValidator;