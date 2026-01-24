'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { PriceHistoryItem, Timeframe } from '@/types/stock';

interface InteractiveChartProps {
  history: PriceHistoryItem[];
  timeframe: Timeframe;
}

export function InteractiveChart({ history, timeframe }: InteractiveChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!history || history.length === 0) return null;

  const prices = history.map(h => h.close);
  const dates = history.map(h => h.date);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  // Responsive margins - smaller on mobile
  const margin = { top: 20, right: 50, bottom: 50, left: 60 };
  const viewBoxWidth = 700;
  const viewBoxHeight = 250;
  const chartWidth = viewBoxWidth - margin.left - margin.right;
  const chartHeight = viewBoxHeight - margin.top - margin.bottom;

  const getX = (i: number) => margin.left + (i / (prices.length - 1)) * chartWidth;
  const getY = (price: number) => margin.top + chartHeight - ((price - minPrice) / range) * chartHeight;

  const points = prices.map((price, i) => `${getX(i)},${getY(price)}`).join(' ');

  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#16a34a' : '#dc2626';

  const formatAxisDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (timeframe === '1m' || timeframe === '1h') {
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (timeframe === '1m' || timeframe === '1h') {
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };

  const yTicks = 5;
  const xTicks = Math.min(5, dates.length);

  const getIndexFromPosition = useCallback((clientX: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const svgWidth = rect.width;
    const x = clientX - rect.left;

    // Scale x to viewBox coordinates
    const scaledX = (x / svgWidth) * viewBoxWidth;

    if (scaledX < margin.left || scaledX > viewBoxWidth - margin.right) {
      return null;
    }

    const ratio = (scaledX - margin.left) / chartWidth;
    const index = Math.round(ratio * (prices.length - 1));
    return Math.max(0, Math.min(prices.length - 1, index));
  }, [chartWidth, margin.left, margin.right, prices.length]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const index = getIndexFromPosition(e.clientX);
    setHoveredIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      const index = getIndexFromPosition(e.touches[0].clientX);
      setHoveredIndex(index);
    }
  };

  const handleMouseLeave = () => setHoveredIndex(null);
  const handleTouchEnd = () => setHoveredIndex(null);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full h-auto overflow-visible cursor-crosshair touch-none"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background */}
        <rect
          x={margin.left}
          y={margin.top}
          width={chartWidth}
          height={chartHeight}
          fill="#fafafa"
        />

        {/* Y-axis */}
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + chartHeight}
          stroke="#9ca3af"
          strokeWidth="1"
        />
        {/* X-axis */}
        <line
          x1={margin.left}
          y1={margin.top + chartHeight}
          x2={margin.left + chartWidth}
          y2={margin.top + chartHeight}
          stroke="#9ca3af"
          strokeWidth="1"
        />

        {/* Y-axis labels (Price) */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const price = minPrice + (range * i) / yTicks;
          const y = margin.top + chartHeight - (i / yTicks) * chartHeight;
          return (
            <g key={`y-${i}`}>
              <line
                x1={margin.left - 5}
                y1={y}
                x2={margin.left}
                y2={y}
                stroke="#9ca3af"
                strokeWidth="1"
              />
              <text
                x={margin.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6b7280"
              >
                ${price.toFixed(2)}
              </text>
              <line
                x1={margin.left}
                y1={y}
                x2={margin.left + chartWidth}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            </g>
          );
        })}

        {/* X-axis labels (Date/Time) */}
        {Array.from({ length: xTicks }).map((_, i) => {
          const idx = Math.floor((i / (xTicks - 1)) * (dates.length - 1));
          const x = getX(idx);
          return (
            <g key={`x-${i}`}>
              <line
                x1={x}
                y1={margin.top + chartHeight}
                x2={x}
                y2={margin.top + chartHeight + 5}
                stroke="#9ca3af"
                strokeWidth="1"
              />
              <text
                x={x}
                y={margin.top + chartHeight + 20}
                textAnchor="middle"
                fontSize="9"
                fill="#6b7280"
              >
                {formatAxisDate(dates[idx])}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text
          x={margin.left - 45}
          y={margin.top + chartHeight / 2}
          textAnchor="middle"
          fontSize="11"
          fill="#374151"
          transform={`rotate(-90, ${margin.left - 45}, ${margin.top + chartHeight / 2})`}
        >
          Price ($)
        </text>
        <text
          x={margin.left + chartWidth / 2}
          y={viewBoxHeight - 8}
          textAnchor="middle"
          fontSize="11"
          fill="#374151"
        >
          {timeframe === '1m' || timeframe === '1h' ? 'Date / Time' : 'Date'}
        </text>

        {/* Gradient fill under line */}
        <defs>
          <linearGradient id={`gradient-${isUp ? 'up' : 'down'}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon
          fill={`url(#gradient-${isUp ? 'up' : 'down'})`}
          points={`${margin.left},${margin.top + chartHeight} ${points} ${margin.left + chartWidth},${margin.top + chartHeight}`}
        />

        {/* Price line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
        />

        {/* Data points on hover area */}
        {prices.map((price, i) => (
          <circle
            key={i}
            cx={getX(i)}
            cy={getY(price)}
            r={hoveredIndex === i ? 6 : 3}
            fill={hoveredIndex === i ? color : 'transparent'}
            stroke={hoveredIndex === i ? 'white' : 'transparent'}
            strokeWidth="2"
            className="transition-all duration-100"
          />
        ))}

        {/* Crosshair */}
        {hoveredIndex !== null && (
          <>
            <line
              x1={getX(hoveredIndex)}
              y1={margin.top}
              x2={getX(hoveredIndex)}
              y2={margin.top + chartHeight}
              stroke="#9ca3af"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
            <line
              x1={margin.left}
              y1={getY(prices[hoveredIndex])}
              x2={margin.left + chartWidth}
              y2={getY(prices[hoveredIndex])}
              stroke="#9ca3af"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm pointer-events-none z-10"
          style={{
            left: `${Math.min((getX(hoveredIndex) / viewBoxWidth) * 100, 70)}%`,
            top: `${Math.max((getY(prices[hoveredIndex]) / viewBoxHeight) * 100 - 30, 0)}%`,
          }}
        >
          <div className="font-semibold">${prices[hoveredIndex].toFixed(2)}</div>
          <div className="text-gray-300 text-xs">{formatTooltipDate(dates[hoveredIndex])}</div>
          <div className="text-xs mt-1">
            <span className="text-gray-400">O:</span> ${history[hoveredIndex].open.toFixed(2)}{' '}
            <span className="text-gray-400">H:</span> ${history[hoveredIndex].high.toFixed(2)}
          </div>
          <div className="text-xs">
            <span className="text-gray-400">L:</span> ${history[hoveredIndex].low.toFixed(2)}{' '}
            <span className="text-gray-400">C:</span> ${history[hoveredIndex].close.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
