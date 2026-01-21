'use client';

import { useState, useEffect, useRef } from 'react';

interface Stock {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  potential_score: number;
  trend: string;
}

type Timeframe = '1h' | '1d' | '1w';

export default function Dashboard() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const fetchedRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTopStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/stocks/top/10?timeframe=${timeframe}`);
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

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (isAutoRefreshing) {
      intervalRef.current = setInterval(() => {
        fetchTopStocks();
      }, 10000 * 6); // 10 seconds

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

  const formatLastUpdate = () => {
    if (!lastUpdate) return 'Never';
    const diff = Math.floor((currentTime.getTime() - lastUpdate.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastUpdate.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Stock Trading Bot
            </h1>
            <nav className="flex gap-4">
              <a href="/" className="text-blue-600 font-medium">
                Dashboard
              </a>
              <a href="/trading" className="text-gray-600 hover:text-gray-900">
                Trading
              </a>
              <a href="/portfolio" className="text-gray-600 hover:text-gray-900">
                Portfolio
              </a>
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
            <p className="mt-4 text-gray-600">Loading stocks for {timeframe} timeframe...</p>
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
                Showing data for <span className="font-semibold text-gray-900">{timeframe}</span> timeframe
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trend
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Potential Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stocks.map((stock) => (
                    <tr key={stock.symbol} className="hover:bg-gray-50 transition">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <a
                          href={`/trading?symbol=${stock.symbol}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Trade
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              How It Works
            </h3>
            <p className="text-gray-600 text-sm">
              Select a high-potential stock, configure your trading strategy, and let the bot monitor prices and execute trades automatically.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Available Strategies
            </h3>
            <ul className="text-gray-600 text-sm space-y-1">
              <li>• Momentum Trading</li>
              <li>• Grid Trading</li>
              <li>• Mean Reversion</li>
              <li>• Breakout Trading</li>
            </ul>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Simulated Trading
            </h3>
            <p className="text-gray-600 text-sm">
              All trades are simulated with virtual funds. Test your strategies risk-free before using real money.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}