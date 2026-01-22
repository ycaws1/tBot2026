// app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '@/lib/api-config';
import { SettingsButton } from '@/components/SettingsModal';

interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  published: string | null;
  sentiment: {
    sentiment: string;
    score: number;
    keyword: {
      score: number;
      confidence: number;
    };
    nlp: {
      sentiment: string;
      score: number;
      positive: number;
      negative: number;
      neutral: number;
    };
  };
}

interface Stock {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  potential_score: number;
  trend: string;
  news?: NewsItem[];
  news_sentiment?: string;
  news_score?: number;
}

type Timeframe = '1m' | '1h' | '1d' | '1w';
type SortColumn = 'trend' | 'potential_score' | 'news_sentiment' | null;
type SortDirection = 'asc' | 'desc';

export default function Dashboard() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTopStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.TOP_STOCKS_WITH_NEWS(10, timeframe));
      if (!response.ok) throw new Error('Failed to fetch stocks');
      const data = await response.json();
      setStocks(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchTopStocks();
  }, []);

  // Fetch when timeframe changes
  useEffect(() => {
    if (fetchedRef.current) {
      fetchTopStocks();
    }
  }, [timeframe]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (isAutoRefreshing) {
      intervalRef.current = setInterval(() => {
        fetchTopStocks();
      }, 10000 * 3);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [isAutoRefreshing, timeframe]);

  // Update current time every second for accurate "ago" display
  useEffect(() => {
    clockRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (clockRef.current) {
        clearInterval(clockRef.current);
      }
    };
  }, []);

  const handleRefresh = () => {
    fetchTopStocks();
  };

  const handleTimeframeChange = (newTimeframe: Timeframe) => {
    setTimeframe(newTimeframe);
  };

  const toggleAutoRefresh = () => {
    setIsAutoRefreshing(!isAutoRefreshing);
  };

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
    if (score >= 70) return 'bg-green-100 text-green-800';
    if (score >= 40) return 'bg-yellow-100 text-yellow-800';
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

  const formatLastUpdate = () => {
    if (!lastUpdate) return 'Never';
    const diff = Math.floor((currentTime.getTime() - lastUpdate.getTime()) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastUpdate.toLocaleTimeString();
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

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortedStocks = () => {
    if (!sortColumn) return stocks;

    return [...stocks].sort((a, b) => {
      let comparison = 0;

      if (sortColumn === 'potential_score') {
        comparison = a.potential_score - b.potential_score;
      } else if (sortColumn === 'trend') {
        const trendOrder = { 'BULLISH': 3, 'NEUTRAL': 2, 'BEARISH': 1 };
        comparison = (trendOrder[a.trend as keyof typeof trendOrder] || 0) -
                     (trendOrder[b.trend as keyof typeof trendOrder] || 0);
      } else if (sortColumn === 'news_sentiment') {
        const sentimentOrder = { 'positive': 3, 'neutral': 2, 'negative': 1 };
        comparison = (sentimentOrder[(a.news_sentiment || 'neutral') as keyof typeof sentimentOrder] || 0) -
                     (sentimentOrder[(b.news_sentiment || 'neutral') as keyof typeof sentimentOrder] || 0);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const toggleExpandStock = (symbol: string) => {
    setExpandedStock(expandedStock === symbol ? null : symbol);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Stock Discovery & Analysis
            </h1>
            <nav className="flex gap-4">
              <a href="/" className="text-blue-600 font-medium">
                Dashboard
              </a>
              <SettingsButton />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">
              Top High-Potential Stocks
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {formatLastUpdate()}
            </p>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            {/* Timeframe Selector */}
            <div className="flex bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <button
                onClick={() => handleTimeframeChange('1m')}
                className={`px-4 py-2 text-sm font-medium transition ${
                  timeframe === '1m'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                1M
              </button>
              <button
                onClick={() => handleTimeframeChange('1h')}
                className={`px-4 py-2 text-sm font-medium transition ${
                  timeframe === '1h'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                1H
              </button>
              <button
                onClick={() => handleTimeframeChange('1d')}
                className={`px-4 py-2 text-sm font-medium transition border-x border-gray-200 ${
                  timeframe === '1d'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                1D
              </button>
              <button
                onClick={() => handleTimeframeChange('1w')}
                className={`px-4 py-2 text-sm font-medium transition ${
                  timeframe === '1w'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                1W
              </button>
            </div>

            {/* Auto-refresh toggle */}
            <button
              onClick={toggleAutoRefresh}
              className={`px-4 py-2 rounded-lg transition shadow border ${
                isAutoRefreshing
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {isAutoRefreshing ? '⚡ Auto-refresh ON' : '⏸ Auto-refresh OFF'}
            </button>

            <button
              onClick={handleRefresh}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow"
            >
              🔄 Refresh Now
            </button>
          </div>
        </div>

        {loading && stocks.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading stocks with news for {timeframe} timeframe...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {!loading && !error && stocks.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800">No stocks found</p>
          </div>
        )}

        {stocks.length > 0 && (
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
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('trend')}
                    >
                      Trend {getSortIcon('trend')}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('potential_score')}
                    >
                      Score {getSortIcon('potential_score')}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('news_sentiment')}
                    >
                      Sentiment {getSortIcon('news_sentiment')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      News
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getSortedStocks().map((stock) => (
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
                          <div className={`text-sm font-medium ${
                            stock.change >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
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
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getScoreColor(stock.potential_score)}`}>
                            {stock.potential_score.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getSentimentColor(stock.news_sentiment || 'neutral')}`}>
                            {getSentimentIcon(stock.news_sentiment || 'neutral')} {stock.news_sentiment || 'neutral'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => toggleExpandStock(stock.symbol)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {expandedStock === stock.symbol ? '▼ Hide' : '▶ View'} ({stock.news?.length || 0})
                          </button>
                        </td>
                      </tr>
                      {expandedStock === stock.symbol && stock.news && stock.news.length > 0 && (
                        <tr key={`${stock.symbol}-news`}>
                          <td colSpan={8} className="px-6 py-4 bg-gray-50">
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
                                        <span>•</span>
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
                                    {/* NLP VADER sentiment */}
                                    <div className="bg-blue-50 rounded p-2">
                                      <div className="font-medium text-blue-600 mb-1">NLP (VADER)</div>
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
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Stock Discovery
            </h3>
            <p className="text-gray-600 text-sm">
              Automatically identifies high-potential stocks based on momentum, volume trends, and price action across multiple timeframes.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              News Sentiment
            </h3>
            <p className="text-gray-600 text-sm">
              Real-time news analysis with sentiment scoring. Click &quot;View&quot; on any stock to see latest news and sentiment indicators.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Market Analysis
            </h3>
            <p className="text-gray-600 text-sm">
              Combines technical indicators with news sentiment to provide comprehensive market insights for informed decision making.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
