'use client';

import React from 'react';
import type { Timeframe, ViewMode } from '@/types/stock';

interface ControlPanelProps {
  timeframe: Timeframe;
  isAutoRefreshing: boolean;
  viewMode: ViewMode;
  lastUpdateText: string;
  onTimeframeChange: (tf: Timeframe) => void;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ControlPanel({
  timeframe,
  isAutoRefreshing,
  viewMode,
  lastUpdateText,
  onTimeframeChange,
  onToggleAutoRefresh,
  onRefresh,
  onViewModeChange,
}: ControlPanelProps) {
  const timeframes: Timeframe[] = ['1m', '1h', '1d', '1w'];

  return (
    <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">
          Top High-Potential Stocks
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Last updated: {lastUpdateText}
        </p>
      </div>

      <div className="flex gap-2 sm:gap-3 items-center flex-wrap">
        {/* View Mode Toggle - visible on all screens */}
        <button
          onClick={() => onViewModeChange(viewMode === 'table' ? 'cards' : 'table')}
          className="px-3 py-3 min-h-[44px] rounded-lg transition shadow border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 text-sm font-medium"
          aria-label={`Switch to ${viewMode === 'table' ? 'card' : 'table'} view`}
        >
          {viewMode === 'table' ? '📇 Cards' : '📊 Table'}
        </button>

        {/* Timeframe Selector */}
        <div className="flex bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {timeframes.map((tf, index) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 sm:px-4 py-3 min-h-[44px] text-sm font-medium transition ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } ${index > 0 && index < timeframes.length - 1 ? 'border-x border-gray-200' : ''}`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Auto-refresh toggle */}
        <button
          onClick={onToggleAutoRefresh}
          className={`px-3 sm:px-4 py-3 min-h-[44px] rounded-lg transition shadow border text-sm font-medium ${
            isAutoRefreshing
              ? 'bg-green-600 text-white border-green-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span className="hidden sm:inline">
            {isAutoRefreshing ? 'Auto ON' : 'Auto OFF'}
          </span>
          <span className="sm:hidden">
            {isAutoRefreshing ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          onClick={onRefresh}
          className="bg-blue-600 text-white px-3 sm:px-4 py-3 min-h-[44px] rounded-lg hover:bg-blue-700 transition shadow text-sm font-medium"
        >
          <span className="hidden sm:inline">Refresh</span>
          <span className="sm:hidden">Refresh</span>
        </button>
      </div>
    </div>
  );
}
