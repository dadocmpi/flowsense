"use client";

import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  SeriesType
} from 'lightweight-charts';
import { Timeframe } from '../../types/trading';
import { generateMockCandles } from '../../hooks/useTradingData';

interface MainChartProps {
  asset: string;
  timeframe: Timeframe;
}

export const MainChart: React.FC<MainChartProps> = ({ asset, timeframe }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [timeframes] = useState<Timeframe[]>(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    
    // Criar o gráfico com opções robustas
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        visible: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    // Na v5, usamos addCandlestickSeries, mas vamos garantir que o objeto existe
    // Se por algum motivo a versão instalada for diferente, tentamos o método genérico
    let candlestickSeries: ISeriesApi<"Candlestick">;
    
    try {
      // @ts-ignore - Fallback para diferentes versões da API
      if (typeof chart.addCandlestickSeries === 'function') {
        candlestickSeries = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });
      } else {
        // Fallback para addSeries se addCandlestickSeries não estiver disponível
        candlestickSeries = chart.addSeries(SeriesType.Candlestick, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });
      }

      // Gerar e formatar dados
      const data = generateMockCandles(100) as CandlestickData<Time>[];
      candlestickSeries.setData(data);
      
      chartRef.current = chart;
      seriesRef.current = candlestickSeries;

      // Ajustar o conteúdo inicial
      chart.timeScale().fitContent();
    } catch (err) {
      console.error("Erro ao inicializar série do gráfico:", err);
    }

    const handleResize = () => {
      if (container && chart) {
        chart.applyOptions({ 
          width: container.clientWidth,
          height: container.clientHeight 
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [asset]);

  return (
    <div className="flex flex-col h-full bg-black">
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
      </div>
      <div ref={chartContainerRef} className="flex-grow relative w-full h-full" />
      <div className="h-24 border-t border-white/5 p-4 bg-white/[0.01]">
        <div className="flex items-start space-x-3">
          <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-bold text-amber-500 uppercase tracking-tighter">
            IA Veredito
          </div>
          <p className="text-xs text-white/70 leading-relaxed">
            Monitorando fluxo institucional em tempo real. Dados via WebSocket ativos. 
            Análise de volume detectando absorção passiva em níveis de suporte.
          </p>
        </div>
      </div>
    </div>
  );
};