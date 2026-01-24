'use client';

import React from 'react';
import type { Stock, Timeframe, SortColumn, PriceHistoryItem } from '@/types/stock';
import { InteractiveChart } from './InteractiveChart';
import { getTimeframeParams } from '@/hooks/usePriceHistory';

interface StockTableProps {
  stocks: Stock[];
  timeframe: Timeframe;
  sortColumn: SortColumn;
  expandedStock: string | null;
  expandedPriceTrend: string | null;
  loadingPriceHistory: string | null;
  loading: boolean;
  onSort: (column: SortColumn) => void;
  getSortIcon: (column: SortColumn) => string;
  onToggleExpand: (symbol: string) => void;
  onTogglePriceTrend: (symbol: string) => void;
  getPriceHistory: (symbol: string) => PriceHistoryItem[] | undefined;
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
    case 'positive': return '📈';
    case 'negative': return '📉';
    default: return '📊';
  }
};

const formatMarketCap = (cap: number | null | undefined) => {
  if (!cap) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${cap.toLocaleString()}`;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(decimals);
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(2)}%`;
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

const getPeColor = (pe: number | null | undefined) => {
  if (!pe) return 'text-gray-500';
  if (pe < 15) return 'text-green-600';
  if (pe < 25) return 'text-yellow-600';
  return 'text-red-600';
};

const get52WeekPosition = (price: number, low: number | null | undefined, high: number | null | undefined) => {
  if (!low || !high || high === low) return null;
  return ((price - low) / (high - low)) * 100;
};

export function StockTable({
  stocks,
  timeframe,
  sortColumn,
  expandedStock,
  expandedPriceTrend,
  loadingPriceHistory,
  loading,
  onSort,
  getSortIcon,
  onToggleExpand,
  onTogglePriceTrend,
  getPriceHistory,
}: StockTableProps) {
  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Showing data for <span className="font-semibold text-gray-900">{timeframe}</span> timeframe with news sentiment
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Updating...</span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Change ({timeframe})
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Volume
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none min-h-[44px]"
                onClick={() => onSort('trend')}
              >
                Trend {getSortIcon('trend')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none min-h-[44px]"
                onClick={() => onSort('potential_score')}
              >
                Score {getSortIcon('potential_score')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none min-h-[44px]"
                onClick={() => onSort('news_sentiment')}
              >
                Sentiment {getSortIcon('news_sentiment')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none min-h-[44px]"
                onClick={() => onSort('pe_ratio')}
              >
                P/E {getSortIcon('pe_ratio')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none min-h-[44px]"
                onClick={() => onSort('market_cap')}
              >
                Mkt Cap {getSortIcon('market_cap')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                52W Range
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {stocks.map((stock) => (
              <React.Fragment key={stock.symbol}>
                <tr className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-gray-900">
                      {stock.symbol}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      ${stock.price.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="group relative inline-block">
                      <div className={`text-sm font-medium ${
                        stock.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                      </div>
                      {/* Change reference tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:flex flex-col items-center z-[100] pointer-events-none">
                        <div className="bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg whitespace-nowrap">
                          <div className="text-gray-300">
                            vs ${stock.change_ref_price?.toFixed(2) ?? 'N/A'}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {stock.change_ref_datetime === 'Previous close'
                              ? 'Previous close'
                              : stock.change_ref_datetime
                                ? new Date(stock.change_ref_datetime).toLocaleString()
                                : 'Previous close'}
                          </div>
                        </div>
                        <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1"></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {(stock.volume / 1000000).toFixed(2)}M
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${getTrendColor(stock.trend)}`}>
                      {getTrendIcon(stock.trend)} {stock.trend}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="group relative">
                      <span
                        onClick={() => onTogglePriceTrend(stock.symbol)}
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 min-h-[44px] items-center ${getScoreColor(stock.potential_score)}`}
                      >
                        {stock.potential_score.toFixed(0)}/100
                      </span>
                      {/* Score breakdown tooltip with bars */}
                      {stock.score_breakdown && (
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[100] bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg whitespace-nowrap pointer-events-none">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-blue-400">Mom</span>
                              <div className="w-24 h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-blue-400 rounded" style={{ width: `${(stock.score_breakdown.momentum / 25) * 100}%` }} />
                              </div>
                              <span className="w-8 text-right">{stock.score_breakdown.momentum}/25</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-purple-400">Vol</span>
                              <div className="w-24 h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-purple-400 rounded" style={{ width: `${(stock.score_breakdown.volatility / 20) * 100}%` }} />
                              </div>
                              <span className="w-8 text-right">{stock.score_breakdown.volatility}/20</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-green-400">Liq</span>
                              <div className="w-24 h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-green-400 rounded" style={{ width: `${(stock.score_breakdown.volume / 20) * 100}%` }} />
                              </div>
                              <span className="w-8 text-right">{stock.score_breakdown.volume}/20</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-yellow-400">Tec</span>
                              <div className="w-24 h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-yellow-400 rounded" style={{ width: `${(stock.score_breakdown.technical / 15) * 100}%` }} />
                              </div>
                              <span className="w-8 text-right">{stock.score_breakdown.technical}/15</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-orange-400">Fun</span>
                              <div className="w-24 h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-orange-400 rounded" style={{ width: `${(stock.score_breakdown.fundamentals / 10) * 100}%` }} />
                              </div>
                              <span className="w-8 text-right">{stock.score_breakdown.fundamentals}/10</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-pink-400">Sen</span>
                              <div className="w-24 h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-pink-400 rounded" style={{ width: `${(stock.score_breakdown.sentiment / 10) * 100}%` }} />
                              </div>
                              <span className="w-8 text-right">{stock.score_breakdown.sentiment}/10</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      onClick={() => onToggleExpand(stock.symbol)}
                      className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 min-h-[44px] items-center ${getSentimentColor(stock.news_sentiment || 'neutral')}`}
                    >
                      {getSentimentIcon(stock.news_sentiment || 'neutral')} {stock.news_sentiment || 'neutral'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${getPeColor(stock.pe_ratio)}`}>
                      {formatNumber(stock.pe_ratio)}
                    </div>
                    {stock.forward_pe && (
                      <div className="text-xs text-gray-400">
                        Fwd: {formatNumber(stock.forward_pe)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatMarketCap(stock.market_cap)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs text-gray-500 mb-1">
                      ${formatNumber(stock.fifty_two_week_low)} - ${formatNumber(stock.fifty_two_week_high)}
                    </div>
                    {stock.fifty_two_week_low && stock.fifty_two_week_high && (
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full relative"
                          style={{ width: `${get52WeekPosition(stock.price, stock.fifty_two_week_low, stock.fifty_two_week_high)}%` }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-700 rounded-full" />
                        </div>
                      </div>
                    )}
                  </td>
                </tr>

                {/* Price Trend Expansion Row */}
                {expandedPriceTrend === stock.symbol && (() => {
                  const history = getPriceHistory(stock.symbol);
                  return (
                    <tr>
                      <td colSpan={10} className="px-6 py-4 bg-purple-50">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-gray-800 text-sm">
                            Price Trend for {stock.symbol} - {getTimeframeParams(timeframe).label}
                          </h4>
                          {loadingPriceHistory === stock.symbol ? (
                            <div className="text-gray-500 text-sm">Loading price history...</div>
                          ) : history && history.length > 0 ? (
                            <div className="flex flex-col gap-4">
                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <InteractiveChart history={history} timeframe={timeframe} />
                              </div>
                              <div className="grid grid-cols-4 gap-4 text-sm">
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="text-gray-500 text-xs">Period High</div>
                                  <div className="font-semibold text-green-600">
                                    ${Math.max(...history.map(h => h.high)).toFixed(2)}
                                  </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="text-gray-500 text-xs">Period Low</div>
                                  <div className="font-semibold text-red-600">
                                    ${Math.min(...history.map(h => h.low)).toFixed(2)}
                                  </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="text-gray-500 text-xs">Start Price</div>
                                  <div className="font-semibold text-gray-800">
                                    ${history[0]?.open.toFixed(2) || 'N/A'}
                                  </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="text-gray-500 text-xs">Latest Close</div>
                                  <div className="font-semibold text-gray-800">
                                    ${history[history.length - 1]?.close.toFixed(2) || 'N/A'}
                                  </div>
                                </div>
                              </div>
                              {/* Financial Indicators */}
                              <div className="mt-4">
                                <h5 className="font-semibold text-gray-700 text-sm mb-2">Financial Indicators</h5>
                                <div className="grid grid-cols-6 gap-3 text-sm">
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="text-gray-500 text-xs">EPS</div>
                                    <div className="font-semibold text-gray-800">
                                      ${formatNumber(stock.eps)}
                                    </div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="text-gray-500 text-xs">Beta</div>
                                    <div className={`font-semibold ${(stock.beta || 0) > 1 ? 'text-orange-600' : 'text-green-600'}`}>
                                      {formatNumber(stock.beta)}
                                    </div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="text-gray-500 text-xs">Div Yield</div>
                                    <div className="font-semibold text-blue-600">
                                      {formatPercent(stock.dividend_yield)}
                                    </div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="text-gray-500 text-xs">P/B Ratio</div>
                                    <div className="font-semibold text-gray-800">
                                      {formatNumber(stock.price_to_book)}
                                    </div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="text-gray-500 text-xs">Profit Margin</div>
                                    <div className={`font-semibold ${(stock.profit_margin || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatPercent(stock.profit_margin)}
                                    </div>
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="text-gray-500 text-xs">Revenue Growth</div>
                                    <div className={`font-semibold ${(stock.revenue_growth || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatPercent(stock.revenue_growth)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Day Trading Score Breakdown */}
                              {stock.score_breakdown && (
                                <div className="mt-4">
                                  <h5 className="font-semibold text-gray-700 text-sm mb-2">
                                    Day Trading Score Breakdown
                                    <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getScoreColor(stock.potential_score)}`}>
                                      {stock.potential_score.toFixed(0)}/100
                                    </span>
                                  </h5>
                                  <div className="grid grid-cols-6 gap-3">
                                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 text-xs">Momentum</span>
                                        <span className="text-xs font-semibold text-blue-600">{stock.score_breakdown.momentum}/25</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded">
                                        <div className="h-full bg-blue-500 rounded" style={{ width: `${(stock.score_breakdown.momentum / 25) * 100}%` }} />
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">Price direction & strength</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 text-xs">Volatility</span>
                                        <span className="text-xs font-semibold text-purple-600">{stock.score_breakdown.volatility}/20</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded">
                                        <div className="h-full bg-purple-500 rounded" style={{ width: `${(stock.score_breakdown.volatility / 20) * 100}%` }} />
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">Price swing potential</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 text-xs">Volume</span>
                                        <span className="text-xs font-semibold text-green-600">{stock.score_breakdown.volume}/20</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded">
                                        <div className="h-full bg-green-500 rounded" style={{ width: `${(stock.score_breakdown.volume / 20) * 100}%` }} />
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">Liquidity & interest</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 text-xs">Technical</span>
                                        <span className="text-xs font-semibold text-yellow-600">{stock.score_breakdown.technical}/15</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded">
                                        <div className="h-full bg-yellow-500 rounded" style={{ width: `${(stock.score_breakdown.technical / 15) * 100}%` }} />
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">52W position & levels</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 text-xs">Fundamentals</span>
                                        <span className="text-xs font-semibold text-orange-600">{stock.score_breakdown.fundamentals}/10</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded">
                                        <div className="h-full bg-orange-500 rounded" style={{ width: `${(stock.score_breakdown.fundamentals / 10) * 100}%` }} />
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">P/E, margins, growth</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 text-xs">Sentiment</span>
                                        <span className="text-xs font-semibold text-pink-600">{stock.score_breakdown.sentiment}/10</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded">
                                        <div className="h-full bg-pink-500 rounded" style={{ width: `${(stock.score_breakdown.sentiment / 10) * 100}%` }} />
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">News sentiment</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-gray-500 text-sm">No price history available</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })()}

                {/* News Expansion Row */}
                {expandedStock === stock.symbol && stock.news && stock.news.length > 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-4 bg-gray-50">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-gray-800 text-sm">Latest News for {stock.symbol}</h4>
                        {stock.news.map((item, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1">
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {item.title}
                                </a>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                  <span>{item.publisher}</span>
                                  <span>-</span>
                                  <span>{formatPublishedDate(item.published)}</span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 items-end">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${getSentimentColor(item.sentiment.sentiment)}`}>
                                  {getSentimentIcon(item.sentiment.sentiment)} {item.sentiment.sentiment} ({item.sentiment.score})
                                </span>
                              </div>
                            </div>
                            {/* Sentiment breakdown */}
                            <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs">
                              {/* Keyword-based sentiment */}
                              <div className="bg-gray-50 rounded p-2">
                                <div className="font-medium text-gray-600 mb-1">Keyword Analysis</div>
                                <div className="flex items-center justify-between">
                                  <span className={item.sentiment.keyword?.score > 0 ? 'text-green-600' : item.sentiment.keyword?.score < 0 ? 'text-red-600' : 'text-gray-600'}>
                                    Score: {item.sentiment.keyword?.score ?? 'N/A'}
                                  </span>
                                  <span className="text-gray-500">
                                    Conf: {((item.sentiment.keyword?.confidence ?? 0) * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                              {/* NLP FastText sentiment */}
                              <div className="bg-blue-50 rounded p-2">
                                <div className="font-medium text-blue-600 mb-1">NLP (FastText)</div>
                                <div className="flex items-center justify-between">
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${getSentimentColor(item.sentiment.nlp?.sentiment || 'neutral')}`}>
                                    {item.sentiment.nlp?.sentiment ?? 'N/A'}
                                  </span>
                                  <span className={item.sentiment.nlp?.score > 0 ? 'text-green-600' : item.sentiment.nlp?.score < 0 ? 'text-red-600' : 'text-gray-600'}>
                                    {item.sentiment.nlp?.score ?? 'N/A'}
                                  </span>
                                </div>
                                {item.sentiment.nlp && (
                                  <div className="mt-1 flex gap-2 text-[10px]">
                                    <span className="text-green-600">+{(item.sentiment.nlp.positive * 100).toFixed(0)}%</span>
                                    <span className="text-gray-500">{(item.sentiment.nlp.neutral * 100).toFixed(0)}%</span>
                                    <span className="text-red-600">-{(item.sentiment.nlp.negative * 100).toFixed(0)}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
