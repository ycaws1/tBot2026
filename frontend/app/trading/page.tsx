'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface TradingConfig {
  symbol: string;
  strategy: string;
  capital: number;
  entry_threshold: number;
  exit_threshold: number;
  stop_loss: number;
}

interface ActiveBot {
  bot_id: string;
  status: string;
  config: TradingConfig;
}

export default function TradingPage() {
  const searchParams = useSearchParams();
  const symbolParam = searchParams.get('symbol');

  const [config, setConfig] = useState<TradingConfig>({
    symbol: symbolParam || 'AAPL',
    strategy: 'momentum',
    capital: 10000,
    entry_threshold: 0.02,
    exit_threshold: 0.03,
    stop_loss: -0.05
  });

  const [activeBots, setActiveBots] = useState<ActiveBot[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [copiedBotId, setCopiedBotId] = useState<string | null>(null);

  useEffect(() => {
    if (config.symbol) {
      fetchCurrentPrice(config.symbol);
    }
    // Load saved bots from session and verify with backend
    loadAndVerifyBots();
  }, [config.symbol]);

  const loadAndVerifyBots = async () => {
    try {
      // First, try to get bots from backend
      const response = await fetch('http://localhost:8000/api/bots/active');
      if (response.ok) {
        const backendBots = await response.json();
        
        // If backend has bots, use those
        if (backendBots.length > 0) {
          const formattedBots = backendBots.map((bot: any) => ({
            bot_id: bot.bot_id,
            status: 'started',
            config: bot.config || {
              symbol: bot.symbol,
              strategy: bot.strategy,
              capital: 10000,
              entry_threshold: 0.02,
              exit_threshold: 0.03,
              stop_loss: -0.05
            }
          }));
          setActiveBots(formattedBots);
          sessionStorage.setItem('activeBots', JSON.stringify(formattedBots));
          return;
        }
      }
      
      // If backend has no bots, check session storage
      const savedBots = sessionStorage.getItem('activeBots');
      if (savedBots) {
        const bots = JSON.parse(savedBots);
        // Verify each bot still exists on backend
        const verifiedBots = [];
        for (const bot of bots) {
          try {
            const checkResponse = await fetch(`http://localhost:8000/api/portfolio/${bot.bot_id}`);
            if (checkResponse.ok) {
              verifiedBots.push(bot);
            }
          } catch {
            // Bot doesn't exist on backend, skip it
          }
        }
        setActiveBots(verifiedBots);
        sessionStorage.setItem('activeBots', JSON.stringify(verifiedBots));
      }
    } catch (err) {
      console.error('Error loading bots:', err);
      // If backend is down, still show cached bots
      const savedBots = sessionStorage.getItem('activeBots');
      if (savedBots) {
        setActiveBots(JSON.parse(savedBots));
      }
    }
  };

  const fetchCurrentPrice = async (symbol: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/price/${symbol}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentPrice(data.price);
      }
    } catch (err) {
      console.error('Failed to fetch price:', err);
    }
  };

  const startBot = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) throw new Error('Failed to start bot');

      const data = await response.json();
      const updatedBots = [...activeBots, data];
      setActiveBots(updatedBots);
      // Save to session storage
      sessionStorage.setItem('activeBots', JSON.stringify(updatedBots));
      setMessage({ type: 'success', text: `Bot started successfully! Bot ID: ${data.bot_id}` });
      
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to start bot' 
      });
    } finally {
      setLoading(false);
    }
  };

  const stopBot = async (botId: string) => {
    console.log('Stopping bot:', botId);
    console.log('Current active bots:', activeBots);
    
    try {
      const response = await fetch(`http://localhost:8000/api/bot/stop/${botId}`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to stop bot');

      // Filter out the stopped bot - create new array
      const updatedBots = activeBots.filter(bot => bot.bot_id !== botId);
      console.log('Updated bots after filter:', updatedBots);
      console.log('Number of bots before:', activeBots.length, 'after:', updatedBots.length);
      
      // Force state update with new array reference
      setActiveBots([...updatedBots]);
      
      // Update session storage
      sessionStorage.setItem('activeBots', JSON.stringify(updatedBots));
      console.log('Session storage updated');
      
      // Show success message
      setMessage({ type: 'success', text: 'Bot stopped successfully!' });
      
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      console.error('Error stopping bot:', err);
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to stop bot' 
      });
    }
  };

  const copyBotId = async (botId: string) => {
    try {
      await navigator.clipboard.writeText(botId);
      setCopiedBotId(botId);
      setTimeout(() => setCopiedBotId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const strategies = [
    { value: 'momentum', label: 'Momentum Trading', description: 'Buy on upward momentum, sell on reversal' },
    { value: 'grid', label: 'Grid Trading', description: 'Place orders at predetermined price levels' },
    { value: 'mean_reversion', label: 'Mean Reversion', description: 'Buy low, sell when price returns to average' },
    { value: 'breakout', label: 'Breakout Trading', description: 'Buy on resistance breakout' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Trading Configuration
            </h1>
            <nav className="flex gap-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/trading" className="text-blue-600 font-medium">
                Trading
              </Link>
              <Link href="/portfolio" className="text-gray-600 hover:text-gray-900">
                Portfolio
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Form */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow-lg rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-6">
                Configure Trading Bot
              </h2>

              <div className="space-y-6">
                {/* Stock Symbol */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Stock Symbol
                  </label>
                  <input
                    type="text"
                    value={config.symbol}
                    onChange={(e) => setConfig({ ...config, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    placeholder="AAPL"
                  />
                  {currentPrice && (
                    <p className="mt-1 text-sm text-gray-600">
                      Current Price: ${currentPrice.toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Strategy Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trading Strategy
                  </label>
                  <select
                    value={config.strategy}
                    onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  >
                    {strategies.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-600">
                    {strategies.find(s => s.value === config.strategy)?.description}
                  </p>
                </div>

                {/* Capital */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trading Capital ($)
                  </label>
                  <input
                    type="number"
                    value={config.capital}
                    onChange={(e) => setConfig({ ...config, capital: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    min="100"
                    step="100"
                  />
                </div>

                {/* Entry Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Entry Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={config.entry_threshold * 100}
                    onChange={(e) => setConfig({ ...config, entry_threshold: parseFloat(e.target.value) / 100 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    step="0.1"
                  />
                  <p className="mt-1 text-sm text-gray-600">
                    Price movement required to trigger entry signal
                  </p>
                </div>

                {/* Exit Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exit Threshold (Profit Target) (%)
                  </label>
                  <input
                    type="number"
                    value={config.exit_threshold * 100}
                    onChange={(e) => setConfig({ ...config, exit_threshold: parseFloat(e.target.value) / 100 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    step="0.1"
                  />
                  <p className="mt-1 text-sm text-gray-600">
                    Profit target to trigger exit signal
                  </p>
                </div>

                {/* Stop Loss */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    value={config.stop_loss * 100}
                    onChange={(e) => setConfig({ ...config, stop_loss: parseFloat(e.target.value) / 100 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    step="0.1"
                    max="0"
                  />
                  <p className="mt-1 text-sm text-gray-600">
                    Maximum loss before automatic exit
                  </p>
                </div>

                {/* Start Button */}
                <button
                  onClick={startBot}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? 'Starting Bot...' : 'Start Trading Bot'}
                </button>
              </div>
            </div>
          </div>

          {/* Active Bots Sidebar */}
          <div>
            <div className="bg-white shadow-lg rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Active Bots
                </h3>
                <button
                  onClick={loadAndVerifyBots}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  title="Sync with backend"
                >
                  🔄
                </button>
              </div>

              {activeBots.length === 0 ? (
                <p className="text-gray-600 text-sm">
                  No active bots. Configure and start a bot to begin trading.
                </p>
              ) : (
                <div className="space-y-4">
                  {activeBots.map(bot => (
                    <div key={bot.bot_id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">
                            {bot.config.symbol}
                          </p>
                          <p className="text-sm text-gray-600">
                            {strategies.find(s => s.value === bot.config.strategy)?.label}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500 font-mono truncate">
                              {bot.bot_id}
                            </p>
                            <button
                              onClick={() => copyBotId(bot.bot_id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                              title="Copy Bot ID"
                            >
                              {copiedBotId === bot.bot_id ? '✓' : '📋'}
                            </button>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Active
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Capital: ${bot.config.capital.toLocaleString()}
                      </p>
                      <button
                        onClick={() => stopBot(bot.bot_id)}
                        className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition text-sm"
                      >
                        Stop Bot
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Strategy Info */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">
                💡 Trading Tips
              </h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Start with smaller capital to test strategies</li>
                <li>• Monitor bot performance regularly</li>
                <li>• Adjust thresholds based on volatility</li>
                <li>• Use stop loss to limit downside risk</li>
                <li>• Click 🔄 to sync bots with backend</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}