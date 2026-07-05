import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { Timeframe } from '../../types/trading';
import { generateMockCandles } from '../../hooks/useTradingData';

interface MainChartProps {
  asset: string;
  timeframe: Timeframe;
}

export const MainChart: React.FC<MainChartProps> = ({ asset, timeframe }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframes] = useState<Timeframe[]>(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0f14' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.2)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.2)' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#ffffff',
      downColor: '#1a1a1a',
      borderVisible: true,
      wickUpColor: '#888888',
      wickDownColor: '#888888',
      borderUpColor: '#ffffff',
      borderDownColor: '#ffffff',
    });

    const data = generateMockCandles(100);
    candlestickSeries.setData(data);

    // Simular Overlays SMC
    // Order Block (OB)
    const obPrice = data[data.length - 20].low;
    const obSeries = chart.addHistogramSeries({
      color: 'rgba(38, 166, 154, 0.15)',
      priceFormat: { type: 'price' },
    });
    
    // FVG
    const fvgSeries = chart.addHistogramSeries({
      color: 'rgba(245, 158, 11, 0.1)',
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [asset, timeframe]);

  return (
    <div className="flex flex-col h-full bg-[#0d0f14]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-bold text-white">{asset}</span>
          <div className="flex bg-white/5 rounded p-0.5">
            {timeframes.map(tf => (
              <button
                key={tf}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                  timeframe === tf ? 'bg-white text-black' : 'text-white/40 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center space-x-3 text-[10px] font-mono text-white/40">
          <span className="flex items-center"><div className="w-2 h-2 bg-white border border-white/20 mr-1"></div> BULL</span>
          <span className="flex items-center"><div className="w-2 h-2 bg-[#1a1a1a] border border-white/20 mr-1"></div> BEAR</span>
          <span className="flex items-center"><div className="w-2 h-2 bg-[#26a69a]/20 mr-1"></div> OB</span>
          <span className="flex items-center"><div className="w-2 h-2 bg-[#f59e0b]/20 mr-1"></div> FVG</span>
        </div>
      </div>
      
      <div ref={chartContainerRef} className="flex-grow relative" />
      
      <div className="h-24 border-t border-white/5 p-4 bg-white/[0.02]">
        <div className="flex items-start space-x-3">
          <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-bold text-amber-500 uppercase tracking-tighter">
            IA Veredito
          </div>
          <p className="text-xs text-white/70 leading-relaxed max-w-3xl">
            Sweep de liquidez detectado abaixo do low de Londres. O preço reagiu em um <span className="text-white font-bold">H1 Bullish Order Block</span>. 
            Aguardando <span className="text-white font-bold">CHoCH em M5</span> para confirmar reversão estrutural. 
            Viés: <span className="text-[#26a69a] font-bold">COMPRA</span> em zona de desconto (abaixo de 50% do range atual).
          </p>
        </div>
      </div>
    </div>
  );
};