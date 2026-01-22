// app/portfolio/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts';
import { API_ENDPOINTS } from '@/lib/api-config';
import { SettingsButton } from '@/components/SettingsModal';


interface Trade {
  id: string;
  symbol: string;
  action: string;
  price: number;
  quantity: number;
  timestamp: string;
  total: number;
}

interface Position {
  quantity: number;
  avg_price: number;
}

interface Portfolio {
  cash: number;
  equity: number;
  positions: Record<string, Position>;
  trades: Trade[];
  profit_loss: number;
}

type ChartTimeframe = '1m' | '1h' | '1d' | '1w';

export default function PortfolioPage() {
  const [botId, setBotId] = useState('');
  const [availableBots, setAvailableBots] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartSymbol, setChartSymbol] = useState('');
  const [showChartInput, setShowChartInput] = useState(false);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const chartRefreshInterval = useRef<NodeJS.Timeout | null>(null);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const savedBots = sessionStorage.getItem('activeBots');
    if (savedBots) {
      const bots = JSON.parse(savedBots);
      const botIds = bots.map((bot: any) => bot.bot_id);
      setAvailableBots(botIds);
      if (botIds.length > 0 && !botId) {
        setBotId(botIds[0]);
      }
    }
    
    fetchActiveBots();
  }, []);

  // Auto-refresh chart every 30 seconds with countdown
  useEffect(() => {
    if (autoRefresh && chartSymbol && portfolio) {
      setRefreshCountdown(30);

      // Countdown timer - updates every second
      countdownInterval.current = setInterval(() => {
        setRefreshCountdown(prev => {
          if (prev <= 1) {
            return 30; // Reset after reaching 0
          }
          return prev - 1;
        });
      }, 1000);

      // Actual refresh timer
      chartRefreshInterval.current = setInterval(() => {
        console.log('Auto-refreshing chart...');
        fetchPriceHistory(chartSymbol, portfolio.trades, chartTimeframe);
        setRefreshCountdown(30); // Reset countdown after refresh
      }, 30000); // 30 seconds

      return () => {
        if (chartRefreshInterval.current) {
          clearInterval(chartRefreshInterval.current);
        }
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
        }
      };
    } else {
      if (chartRefreshInterval.current) {
        clearInterval(chartRefreshInterval.current);
      }
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
      setRefreshCountdown(30);
    }
  }, [autoRefresh, chartSymbol, portfolio, chartTimeframe]);

  const fetchActiveBots = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.ACTIVE_BOTS());
      if (response.ok) {
        const bots = await response.json();
        const botIds = bots.map((bot: any) => bot.bot_id);
        setAvailableBots(botIds);
        if (botIds.length > 0 && !botId) {
          setBotId(botIds[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active bots:', err);
    }
  };

  const fetchPortfolio = async () => {
    if (!botId) {
      setError('Please enter a Bot ID');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(API_ENDPOINTS.PORTFOLIO(botId));
      
      if (!response.ok) {
        throw new Error('Portfolio not found');
      }

      const data = await response.json();
      setPortfolio(data);
      
      if (data.trades && data.trades.length > 0) {
        const symbol = data.trades[0].symbol;
        setChartSymbol(symbol);
        await fetchPriceHistory(symbol, data.trades, chartTimeframe);
      } else {
        setShowChartInput(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
      setPortfolio(null);
    } finally {
      setLoading(false);
    }
  };

  const getTimeframeConfig = (timeframe: ChartTimeframe) => {
    const configs = {
      '1m': {
        period: '7d',
        interval: '1m',
        label: '1M',
        dataPoints: 'minute-level'
      },
      '1h': {
        period: '5d',
        interval: '1h',
        label: '1H',
        dataPoints: 'hourly'
      },
      '1d': {
        period: '1mo',
        interval: '1d',
        label: '1D',
        dataPoints: 'daily'
      },
      '1w': {
        period: '3mo',
        interval: '1d',
        label: '1W',
        dataPoints: 'daily'
      }
    };
    return configs[timeframe];
  };

  const fetchPriceHistory = async (symbol: string, trades: Trade[] = [], timeframe: ChartTimeframe = '1h') => {
    try {
      setLoadingChart(true);
      const config = getTimeframeConfig(timeframe);

      console.log(`Fetching price history for ${symbol}: ${config.period} with ${config.interval} interval`);
      const response = await fetch(API_ENDPOINTS.PRICE_HISTORY(symbol, config.period, config.interval));

      if (!response.ok) {
        console.error('Failed to fetch price history');
        return;
      }

      const data = await response.json();
      console.log(`Received ${data.length} data points for ${symbol}`);

      if (data.length === 0) {
        console.warn('No data points received');
        setPriceHistory([]);
        return;
      }

      // Debug: log timestamps
      if (data.length > 0 && trades.length > 0) {
        console.log('Price data range:', data[0].date, 'to', data[data.length - 1].date);
        console.log('Trades:', trades.map(t => ({ action: t.action, timestamp: t.timestamp })));
      }

      // Helper to check if trade matches a data point
      const tradeMatchesDataPoint = (trade: Trade, itemDate: Date, timeframe: ChartTimeframe): boolean => {
        const tradeDate = new Date(trade.timestamp);

        if (timeframe === '1d' || timeframe === '1w') {
          // Match by same calendar day
          return tradeDate.getFullYear() === itemDate.getFullYear() &&
                 tradeDate.getMonth() === itemDate.getMonth() &&
                 tradeDate.getDate() === itemDate.getDate();
        } else if (timeframe === '1h') {
          // Match by same day AND same hour
          return tradeDate.getFullYear() === itemDate.getFullYear() &&
                 tradeDate.getMonth() === itemDate.getMonth() &&
                 tradeDate.getDate() === itemDate.getDate() &&
                 tradeDate.getHours() === itemDate.getHours();
        } else {
          // 1m: match within 2 minutes
          const timeDiff = Math.abs(tradeDate.getTime() - itemDate.getTime());
          return timeDiff < 2 * 60 * 1000;
        }
      };

      // Find the closest data point index for a trade
      const findClosestDataPointIndex = (trade: Trade): number => {
        const tradeTime = new Date(trade.timestamp).getTime();
        let closestIdx = data.length - 1;
        let closestDiff = Infinity;

        for (let i = 0; i < data.length; i++) {
          const dataTime = new Date(data[i].date).getTime();
          const diff = Math.abs(tradeTime - dataTime);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestIdx = i;
          }
        }
        return closestIdx;
      };

      // Track which trades have been matched
      const matchedTradeIds = new Set<string>();

      const chartData = data.map((item: any, idx: number) => {
        const itemDate = new Date(item.date);
        const dataPoint: any = {
          date: timeframe === '1m'
            ? itemDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : timeframe === '1h'
            ? itemDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })
            : itemDate.toLocaleDateString(),
          fullDate: itemDate.toLocaleString(),
          timestamp: itemDate.getTime(),
          price: item.close,
        };

        // Match trades to this data point
        const tradesInWindow = trades.filter(trade => {
          if (matchedTradeIds.has(trade.id)) return false;
          return tradeMatchesDataPoint(trade, itemDate, timeframe);
        });

        if (tradesInWindow.length > 0) {
          tradesInWindow.forEach(trade => {
            matchedTradeIds.add(trade.id);
            if (trade.action === 'BUY') {
              dataPoint.buyPrice = trade.price;
              dataPoint.buyQuantity = trade.quantity;
            } else {
              dataPoint.sellPrice = trade.price;
              dataPoint.sellQuantity = trade.quantity;
            }
          });
        }

        return dataPoint;
      });

      // Handle unmatched trades - assign them to the closest data point
      const unmatchedTrades = trades.filter(t => !matchedTradeIds.has(t.id));
      if (unmatchedTrades.length > 0) {
        console.log('Unmatched trades (will assign to closest point):', unmatchedTrades.map(t => t.timestamp));
        unmatchedTrades.forEach(trade => {
          const closestIdx = findClosestDataPointIndex(trade);
          console.log(`Assigning trade ${trade.id} to data point ${closestIdx} (${data[closestIdx].date})`);
          if (trade.action === 'BUY') {
            chartData[closestIdx].buyPrice = trade.price;
            chartData[closestIdx].buyQuantity = trade.quantity;
          } else {
            chartData[closestIdx].sellPrice = trade.price;
            chartData[closestIdx].sellQuantity = trade.quantity;
          }
        });
      }

      console.log(`Processed ${chartData.length} chart data points`);
      setPriceHistory(chartData);
    } catch (err) {
      console.error('Error fetching price history:', err);
    } finally {
      setLoadingChart(false);
    }
  };

  const loadChartForSymbol = async () => {
    if (!chartSymbol.trim()) {
      alert('Please enter a stock symbol');
      return;
    }
    await fetchPriceHistory(chartSymbol.toUpperCase(), portfolio?.trades || [], chartTimeframe);
  };

  const handleTimeframeChange = (newTimeframe: ChartTimeframe) => {
    setChartTimeframe(newTimeframe);
    if (chartSymbol) {
      fetchPriceHistory(chartSymbol, portfolio?.trades || [], newTimeframe);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="text-xs font-semibold text-gray-600">{data.fullDate || data.date}</p>
          <p className="text-sm text-gray-700 font-medium mt-1">
            Price: {formatCurrency(data.price)}
          </p>
          {data.buyPrice && (
            <p className="text-sm text-green-600 font-medium mt-1">
              🟢 BUY: {data.buyQuantity} @ {formatCurrency(data.buyPrice)}
            </p>
          )}
          {data.sellPrice && (
            <p className="text-sm text-red-600 font-medium mt-1">
              🔴 SELL: {data.sellQuantity} @ {formatCurrency(data.sellPrice)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Portfolio</h1>
            <nav className="flex gap-4">
              <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="/trading" className="text-gray-600 hover:text-gray-900">Trading</a>
              <a href="/portfolio" className="text-blue-600 font-medium">Portfolio</a>
              <SettingsButton />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">View Portfolio</h2>
            {availableBots.length > 0 && (
              <button onClick={fetchActiveBots} className="text-sm text-blue-600 hover:text-blue-800">
                🔄 Refresh Bots
              </button>
            )}
          </div>
          <div className="flex gap-4">
            {availableBots.length > 0 ? (
              <select
                value={botId}
                onChange={(e) => setBotId(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              >
                <option value="">Select a Bot ID</option>
                {availableBots.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={botId}
                onChange={(e) => setBotId(e.target.value)}
                placeholder="Enter Bot ID"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              />
            )}
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Load Portfolio'}
            </button>
          </div>
          {availableBots.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">
              No active bots found. Start a bot from the Trading page first.
            </p>
          )}
          {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
        </div>

        {portfolio && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white shadow-lg rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-1">Total Equity</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(portfolio.equity)}</p>
              </div>
              <div className="bg-white shadow-lg rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-1">Available Cash</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(portfolio.cash)}</p>
              </div>
              <div className="bg-white shadow-lg rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-1">Profit/Loss</p>
                <p className={`text-2xl font-bold ${portfolio.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {portfolio.profit_loss >= 0 ? '+' : ''}{formatCurrency(portfolio.profit_loss)}
                </p>
              </div>
              <div className="bg-white shadow-lg rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-1">Return</p>
                <p className={`text-2xl font-bold ${portfolio.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {portfolio.profit_loss >= 0 ? '+' : ''}
                  {((portfolio.profit_loss / (portfolio.equity - portfolio.profit_loss)) * 100).toFixed(2)}%
                </p>
              </div>
            </div>

            {(priceHistory.length > 0 || showChartInput) && (
              <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-800">Price History & Trade Activity</h3>
                    {priceHistory.length > 0 && (
                      <span className="text-xs text-gray-500">
                        ({priceHistory.length} data points)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {/* Auto-refresh Toggle with Countdown */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          autoRefresh
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        title={autoRefresh ? 'Auto-refresh ON (every 30s)' : 'Auto-refresh OFF'}
                      >
                        {autoRefresh ? '⚡ Auto-refresh' : '⏸ Paused'}
                      </button>
                      {autoRefresh && chartSymbol && (
                        <span className="text-xs text-gray-500 font-mono min-w-[32px]">
                          {refreshCountdown}s
                        </span>
                      )}
                    </div>
                    
                    {/* Timeframe Selector */}
                    <div className="flex bg-gray-100 rounded-lg overflow-hidden">
                      {(['1m', '1h', '1d', '1w'] as ChartTimeframe[]).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => handleTimeframeChange(tf)}
                          className={`px-3 py-1.5 text-xs font-medium transition ${
                            chartTimeframe === tf
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {getTimeframeConfig(tf).label}
                        </button>
                      ))}
                    </div>
                    
                    {showChartInput && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={chartSymbol}
                          onChange={(e) => setChartSymbol(e.target.value.toUpperCase())}
                          placeholder="Enter symbol (e.g., AAPL)"
                          className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                          onKeyPress={(e) => e.key === 'Enter' && loadChartForSymbol()}
                        />
                        <button
                          onClick={loadChartForSymbol}
                          disabled={loadingChart}
                          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                        >
                          {loadingChart ? 'Loading...' : 'Load'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {loadingChart ? (
                  <div className="flex justify-center items-center h-80">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                ) : priceHistory.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={priceHistory}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={100}
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }}
                          domain={['auto', 'auto']}
                          tickFormatter={(value) => `${value.toFixed(2)}`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="price" 
                          stroke="#3B82F6" 
                          strokeWidth={2}
                          dot={false}
                          name="Stock Price"
                        />
                        {priceHistory.map((entry, index) => 
                          entry.buyPrice ? (
                            <ReferenceDot
                              key={`buy-${index}`}
                              x={entry.date}
                              y={entry.buyPrice}
                              r={8}
                              fill="#10B981"
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          ) : null
                        )}
                        {priceHistory.map((entry, index) => 
                          entry.sellPrice ? (
                            <ReferenceDot
                              key={`sell-${index}`}
                              x={entry.date}
                              y={entry.sellPrice}
                              r={8}
                              fill="#EF4444"
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          ) : null
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                    {chartTimeframe === '1m' && (
                      <div className="mt-2 text-xs text-gray-500 text-center">
                        Note: 1-minute data only available for last 7 days
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-center items-center h-80 text-gray-500">
                    <p>Enter a stock symbol above to view price history</p>
                  </div>
                )}
                <div className="mt-4 flex gap-4 justify-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                    <span className="text-gray-600">Buy Action</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>
                    <span className="text-gray-600">Sell Action</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-blue-500"></div>
                    <span className="text-gray-600">Price Trend</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Current Positions</h3>
              {Object.keys(portfolio.positions).length === 0 ? (
                <p className="text-gray-600">No active positions</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(portfolio.positions).map(([symbol, position]) => (
                        <tr key={symbol}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{symbol}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{position.quantity}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(position.avg_price)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(position.quantity * position.avg_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white shadow-lg rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Trade History</h3>
              {portfolio.trades.length === 0 ? (
                <p className="text-gray-600">No trades yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trade ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {portfolio.trades.slice().reverse().map((trade) => (
                        <tr key={trade.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.id}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{trade.symbol}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              trade.action === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {trade.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(trade.price)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trade.quantity}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(trade.total)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(trade.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
