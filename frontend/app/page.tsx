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

interface ScoreBreakdown {
  momentum: number;
  volatility: number;
  volume: number;
  technical: number;
  fundamentals: number;
  sentiment: number;
  total: number;
}

interface Stock {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  potential_score: number;
  trend: string;
  score_breakdown?: ScoreBreakdown;
  news?: NewsItem[];
  news_sentiment?: string;
  news_score?: number;
  // Additional indicators
  pe_ratio?: number | null;
  forward_pe?: number | null;
  eps?: number | null;
  market_cap?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  dividend_yield?: number | null;
  beta?: number | null;
  avg_volume?: number | null;
  profit_margin?: number | null;
  revenue_growth?: number | null;
  price_to_book?: number | null;
}

interface PriceHistoryItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Timeframe = '1m' | '1h' | '1d' | '1w';
type SortColumn = 'trend' | 'potential_score' | 'news_sentiment' | 'pe_ratio' | 'market_cap' | 'dividend_yield' | null;
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
  const [expandedPriceTrend, setExpandedPriceTrend] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistoryItem[]>>({});
  const [loadingPriceHistory, setLoadingPriceHistory] = useState<string | null>(null);
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

  // Re-fetch price history when timeframe changes and a price trend is expanded
  useEffect(() => {
    if (expandedPriceTrend) {
      fetchPriceHistory(expandedPriceTrend);
    }
  }, [timeframe]);

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
    if (score >= 75) return 'bg-green-100 text-green-800';  // Excellent potential
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';  // Good potential
    return 'bg-red-100 text-red-800';  // Low potential
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

  const formatMarketCap = (cap: number | null | undefined) => {
    if (!cap) return 'N/A';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString()}`;
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(decimals);
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
      } else if (sortColumn === 'pe_ratio') {
        comparison = (a.pe_ratio || 9999) - (b.pe_ratio || 9999);
      } else if (sortColumn === 'market_cap') {
        comparison = (a.market_cap || 0) - (b.market_cap || 0);
      } else if (sortColumn === 'dividend_yield') {
        comparison = (a.dividend_yield || 0) - (b.dividend_yield || 0);
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

  const getTimeframeParams = (tf: Timeframe): { period: string; interval: string; label: string } => {
    switch (tf) {
      case '1m': return { period: '1d', interval: '1m', label: 'Last Day (1-min intervals)' };
      case '1h': return { period: '5d', interval: '1h', label: 'Last 5 Days (Hourly)' };
      case '1d': return { period: '1mo', interval: '1d', label: 'Last Month (Daily)' };
      case '1w': return { period: '6mo', interval: '1wk', label: 'Last 6 Months (Weekly)' };
      default: return { period: '1mo', interval: '1d', label: 'Last Month (Daily)' };
    }
  };

  const fetchPriceHistory = async (symbol: string) => {
    const cacheKey = `${symbol}-${timeframe}`;
    if (priceHistory[cacheKey]) return;

    setLoadingPriceHistory(symbol);
    try {
      const { period, interval } = getTimeframeParams(timeframe);
      const response = await fetch(API_ENDPOINTS.PRICE_HISTORY(symbol, period, interval));
      if (!response.ok) throw new Error('Failed to fetch price history');
      const data = await response.json();
      setPriceHistory(prev => ({ ...prev, [cacheKey]: data }));
    } catch (err) {
      console.error('Failed to fetch price history:', err);
    } finally {
      setLoadingPriceHistory(null);
    }
  };

  const togglePriceTrend = async (symbol: string) => {
    if (expandedPriceTrend === symbol) {
      setExpandedPriceTrend(null);
    } else {
      setExpandedPriceTrend(symbol);
      await fetchPriceHistory(symbol);
    }
  };

  const getPriceHistoryForStock = (symbol: string): PriceHistoryItem[] | undefined => {
    const cacheKey = `${symbol}-${timeframe}`;
    return priceHistory[cacheKey];
  };

  const InteractiveChart = ({ history, tf }: { history: PriceHistoryItem[]; tf: Timeframe }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    if (!history || history.length === 0) return null;

    const prices = history.map(h => h.close);
    const dates = history.map(h => h.date);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;

    const margin = { top: 20, right: 60, bottom: 50, left: 70 };
    const width = 700;
    const height = 250;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const getX = (i: number) => margin.left + (i / (prices.length - 1)) * chartWidth;
    const getY = (price: number) => margin.top + chartHeight - ((price - minPrice) / range) * chartHeight;

    const points = prices.map((price, i) => `${getX(i)},${getY(price)}`).join(' ');

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#16a34a' : '#dc2626';

    const formatAxisDate = (dateStr: string) => {
      const date = new Date(dateStr);
      if (tf === '1m' || tf === '1h') {
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    const formatTooltipDate = (dateStr: string) => {
      const date = new Date(dateStr);
      if (tf === '1m' || tf === '1h') {
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    const yTicks = 5;
    const xTicks = Math.min(5, dates.length);

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (x < margin.left || x > width - margin.right) {
        setHoveredIndex(null);
        return;
      }

      const ratio = (x - margin.left) / chartWidth;
      const index = Math.round(ratio * (prices.length - 1));
      setHoveredIndex(Math.max(0, Math.min(prices.length - 1, index)));
    };

    const handleMouseLeave = () => setHoveredIndex(null);

    return (
      <div className="relative">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="overflow-visible cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
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
            x={margin.left - 50}
            y={margin.top + chartHeight / 2}
            textAnchor="middle"
            fontSize="11"
            fill="#374151"
            transform={`rotate(-90, ${margin.left - 50}, ${margin.top + chartHeight / 2})`}
          >
            Price ($)
          </text>
          <text
            x={margin.left + chartWidth / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#374151"
          >
            {tf === '1m' || tf === '1h' ? 'Date / Time' : 'Date'}
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
              left: Math.min(getX(hoveredIndex) + 10, width - 150),
              top: Math.max(getY(prices[hoveredIndex]) - 60, 0),
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
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('pe_ratio')}
                    >
                      P/E {getSortIcon('pe_ratio')}
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('market_cap')}
                    >
                      Mkt Cap {getSortIcon('market_cap')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      52W Range
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
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
                          <div className="group relative">
                            <span
                              onClick={() => togglePriceTrend(stock.symbol)}
                              className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 ${getScoreColor(stock.potential_score)}`}
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
                            onClick={() => toggleExpandStock(stock.symbol)}
                            className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 ${getSentimentColor(stock.news_sentiment || 'neutral')}`}
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button
                              onClick={() => togglePriceTrend(stock.symbol)}
                              className={`text-lg hover:scale-110 transition-transform ${expandedPriceTrend === stock.symbol ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                              title="Price Trend"
                            >
                              {loadingPriceHistory === stock.symbol ? '⏳' : '📈'}
                            </button>
                            <button
                              onClick={() => toggleExpandStock(stock.symbol)}
                              className={`text-lg hover:scale-110 transition-transform ${expandedStock === stock.symbol ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                              title={`News (${stock.news?.length || 0})`}
                            >
                              ℹ️
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedPriceTrend === stock.symbol && (() => {
                        const history = getPriceHistoryForStock(stock.symbol);
                        return (
                          <tr>
                            <td colSpan={11} className="px-6 py-4 bg-purple-50">
                              <div className="space-y-3">
                                <h4 className="font-semibold text-gray-800 text-sm">
                                  Price Trend for {stock.symbol} - {getTimeframeParams(timeframe).label}
                                </h4>
                                {loadingPriceHistory === stock.symbol ? (
                                  <div className="text-gray-500 text-sm">Loading price history...</div>
                                ) : history && history.length > 0 ? (
                                  <div className="flex flex-col gap-4">
                                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                                      <InteractiveChart history={history} tf={timeframe} />
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
                      {expandedStock === stock.symbol && stock.news && stock.news.length > 0 && (
                        <tr>
                          <td colSpan={11} className="px-6 py-4 bg-gray-50">
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
                                    {/* NLP DistilRoBERTa sentiment */}
                                    <div className="bg-blue-50 rounded p-2">
                                      <div className="font-medium text-blue-600 mb-1">NLP (DistilRoBERTa)</div>
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
