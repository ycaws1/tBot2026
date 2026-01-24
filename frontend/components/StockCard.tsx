'use client';

import React from 'react';
import type { Stock, Timeframe, PriceHistoryItem } from '@/types/stock';
import { InteractiveChart } from './InteractiveChart';
import { getTimeframeParams } from '@/hooks/usePriceHistory';

interface StockCardProps {
  stock: Stock;
  timeframe: Timeframe;
  isExpanded: boolean;
  isPriceTrendExpanded: boolean;
  priceHistory?: PriceHistoryItem[];
  isLoadingPriceHistory: boolean;
  onToggleExpand: () => void;
  onTogglePriceTrend: () => void;
}

// Utility functions
const getTrendColor = (trend: string) => {
  switch (trend) {
    case 'BULLISH': return 'text-green-600';
    case 'BEARISH': return 'text-red-600';
    default: return 'text-gray-600';
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'BULLISH': return '↑';
    case 'BEARISH': return '↓';
    default: return '→';
  }
};

const getScoreColor = (score: number) => {
  if (score >= 75) return 'bg-green-100 text-green-800';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case 'positive': return 'bg-green-100 text-green-800';
    case 'negative': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getSentimentIcon = (sentiment: string) => {
  switch (sentiment) {
    case 'positive': return '↑';
    case 'negative': return '↓';
    default: return '→';
  }
};

const formatMarketCap = (cap: number | null | undefined) => {
  if (!cap) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap.toLocaleString()}`;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(decimals);
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
};

const formatPublishedDate = (dateStr: string | null) => {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString();
};

export function StockCard({
  stock,
  timeframe,
  isExpanded,
  isPriceTrendExpanded,
  priceHistory,
  isLoadingPriceHistory,
  onToggleExpand,
  onTogglePriceTrend,
}: StockCardProps) {
  const sentiment = stock.news_sentiment || 'neutral';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Main card content - always visible */}
      <div className="p-4">
        {/* Header row: Symbol, Trend */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900">{stock.symbol}</span>
              <span className={`text-sm font-medium ${getTrendColor(stock.trend)}`}>
                {getTrendIcon(stock.trend)} {stock.trend}
              </span>
            </div>
            {stock.company_name && (
              <p className="text-xs text-gray-500 mt-0.5">{stock.company_name}</p>
            )}
          </div>
        </div>

        {/* Price row */}
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-2xl font-semibold text-gray-900">
            ${stock.price.toFixed(2)}
          </span>
          <span className={`text-sm font-medium ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
          </span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={onTogglePriceTrend}
            className={`px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-full ${getScoreColor(stock.potential_score)} active:ring-2 active:ring-offset-1 active:ring-gray-400`}
          >
            Score: {stock.potential_score.toFixed(0)}/100
          </button>
          <button
            onClick={onToggleExpand}
            className={`px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-full ${getSentimentColor(sentiment)} active:ring-2 active:ring-offset-1 active:ring-gray-400`}
          >
            {getSentimentIcon(sentiment)} {sentiment}
          </button>
          {stock.pe_ratio && (
            <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
              P/E: {formatNumber(stock.pe_ratio)}
            </span>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Vol: {(stock.volume / 1000000).toFixed(1)}M</span>
          <span>Cap: {formatMarketCap(stock.market_cap)}</span>
        </div>
      </div>

      {/* Price Trend Expansion */}
      {isPriceTrendExpanded && (
        <div className="border-t border-gray-200 bg-purple-50 p-4">
          <h4 className="font-semibold text-gray-800 text-sm mb-1">
            Price Trend - {getTimeframeParams(timeframe).label}
          </h4>
          {stock.company_name && (
            <p className="text-xs text-gray-500 mb-3">{stock.company_name}</p>
          )}

          {isLoadingPriceHistory ? (
            <div className="text-gray-500 text-sm py-4 text-center">Loading price history...</div>
          ) : priceHistory && priceHistory.length > 0 ? (
            <div className="space-y-4">
              {/* Chart */}
              <div className="bg-white p-3 rounded-lg border border-gray-200">
                <InteractiveChart history={priceHistory} timeframe={timeframe} />
              </div>

              {/* Period stats */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white p-2 rounded-lg border border-gray-200">
                  <div className="text-gray-500 text-xs">Period High</div>
                  <div className="font-semibold text-green-600">
                    ${Math.max(...priceHistory.map(h => h.high)).toFixed(2)}
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-gray-200">
                  <div className="text-gray-500 text-xs">Period Low</div>
                  <div className="font-semibold text-red-600">
                    ${Math.min(...priceHistory.map(h => h.low)).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Financial indicators */}
              {stock.score_breakdown && (
                <div className="space-y-2">
                  <h5 className="font-semibold text-gray-700 text-xs">Score Breakdown</h5>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Momentum', value: stock.score_breakdown.momentum, max: 25, color: 'bg-blue-500' },
                      { label: 'Volatility', value: stock.score_breakdown.volatility, max: 20, color: 'bg-purple-500' },
                      { label: 'Volume', value: stock.score_breakdown.volume, max: 20, color: 'bg-green-500' },
                      { label: 'Technical', value: stock.score_breakdown.technical, max: 15, color: 'bg-yellow-500' },
                      { label: 'Fundamentals', value: stock.score_breakdown.fundamentals, max: 10, color: 'bg-orange-500' },
                      { label: 'Sentiment', value: stock.score_breakdown.sentiment, max: 10, color: 'bg-pink-500' },
                    ].map(({ label, value, max, color }) => (
                      <div key={label} className="bg-white p-2 rounded border border-gray-200">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-gray-500">{label}</span>
                          <span className="font-semibold">{value}/{max}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded">
                          <div className={`h-full ${color} rounded`} style={{ width: `${(value / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional metrics */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white p-2 rounded border border-gray-200">
                  <div className="text-gray-500">EPS</div>
                  <div className="font-semibold">${formatNumber(stock.eps)}</div>
                </div>
                <div className="bg-white p-2 rounded border border-gray-200">
                  <div className="text-gray-500">Beta</div>
                  <div className={`font-semibold ${(stock.beta || 0) > 1 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatNumber(stock.beta)}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-gray-200">
                  <div className="text-gray-500">Div Yield</div>
                  <div className="font-semibold text-blue-600">{formatPercent(stock.dividend_yield)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm py-4 text-center">No price history available</div>
          )}
        </div>
      )}

      {/* News Expansion */}
      {isExpanded && stock.news && stock.news.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <h4 className="font-semibold text-gray-800 text-sm mb-3">Latest News</h4>
          <div className="space-y-3">
            {stock.news.map((item, idx) => (
              <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline line-clamp-2"
                >
                  {item.title}
                </a>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-gray-500">
                    {item.publisher} - {formatPublishedDate(item.published)}
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getSentimentColor(item.sentiment.sentiment)}`}>
                    {item.sentiment.sentiment}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
