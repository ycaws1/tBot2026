'use client';
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts';

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

  const fetchActiveBots = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/bots/active');
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
      const response = await fetch(`http://localhost:8000/api/portfolio/${botId}`);
      
      if (!response.ok) {
        throw new Error('Portfolio not found');
      }

      const data = await response.json();
      setPortfolio(data);
      
      if (data.trades && data.trades.length > 0) {
        const symbol = data.trades[0].symbol;
        setChartSymbol(symbol);
        await fetchPriceHistory(symbol, data.trades);
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

  const fetchPriceHistory = async (symbol: string, trades: Trade[] = []) => {
    try {
      setLoadingChart(true);
      const response = await fetch(`http://localhost:8000/api/history/${symbol}?period=1mo`);
      
      if (!response.ok) {
        console.error('Failed to fetch price history');
        return;
      }

      const data = await response.json();
      
      const chartData = data.map((item: any) => {
        const date = new Date(item.date).getTime();
        const dataPoint: any = {
          date: new Date(item.date).toLocaleDateString(),
          timestamp: date,
          price: item.close,
        };

        const tradesOnDate = trades.filter(trade => {
          const tradeDate = new Date(trade.timestamp).setHours(0, 0, 0, 0);
          const itemDate = new Date(item.date).setHours(0, 0, 0, 0);
          return Math.abs(tradeDate - itemDate) < 86400000;
        });

        if (tradesOnDate.length > 0) {
          tradesOnDate.forEach(trade => {
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
    await fetchPriceHistory(chartSymbol.toUpperCase(), portfolio?.trades || []);
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
          <p className="text-sm font-semibold">{data.date}</p>
          <p className="text-sm text-gray-700">
            Price: {formatCurrency(data.price)}
          </p>
          {data.buyPrice && (
            <p className="text-sm text-green-600 font-medium">
              🟢 BUY: {data.buyQuantity} @ {formatCurrency(data.buyPrice)}
            </p>
          )}
          {data.sellPrice && (
            <p className="text-sm text-red-600 font-medium">
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
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Price History & Trade Activity</h3>
                  {showChartInput && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chartSymbol}
                        onChange={(e) => setChartSymbol(e.target.value.toUpperCase())}
                        placeholder="Enter symbol (e.g., AAPL)"
                        className="px-3 py-1 border-2 border-gray-400 rounded text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        onKeyPress={(e) => e.key === 'Enter' && loadChartForSymbol()}
                      />
                      <button
                        onClick={loadChartForSymbol}
                        disabled={loadingChart}
                        className="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        {loadingChart ? 'Loading...' : 'Load Chart'}
                      </button>
                    </div>
                  )}
                </div>
                {loadingChart ? (
                  <div className="flex justify-center items-center h-80">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                ) : priceHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={priceHistory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
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