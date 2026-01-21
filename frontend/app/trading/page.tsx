'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_ENDPOINTS } from '@/lib/api-config';

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

// 1. Move logic to a sub-component to allow Suspense to handle useSearchParams
function TradingContent() {
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
    loadAndVerifyBots();
  }, [config.symbol]);

  const loadAndVerifyBots = async () => {
    try {
      // Use API_ENDPOINTS.ACTIVE_BOTS()
      const response = await fetch(API_ENDPOINTS.ACTIVE_BOTS());
      if (response.ok) {
        const backendBots = await response.json();
        
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
      
      const savedBots = sessionStorage.getItem('activeBots');
      if (savedBots) {
        const bots = JSON.parse(savedBots);
        const verifiedBots = [];
        for (const bot of bots) {
          try {
            // Use API_ENDPOINTS.PORTFOLIO(id)
            const checkResponse = await fetch(API_ENDPOINTS.PORTFOLIO(bot.bot_id));
            if (checkResponse.ok) {
              verifiedBots.push(bot);
            }
          } catch {
            // Skip if offline/missing
          }
        }
        setActiveBots(verifiedBots);
        sessionStorage.setItem('activeBots', JSON.stringify(verifiedBots));
      }
    } catch (err) {
      console.error('Error loading bots:', err);
      const savedBots = sessionStorage.getItem('activeBots');
      if (savedBots) {
        setActiveBots(JSON.parse(savedBots));
      }
    }
  };

  const fetchCurrentPrice = async (symbol: string) => {
    try {
      // Use API_ENDPOINTS.STOCK_PRICE(symbol)
      const response = await fetch(API_ENDPOINTS.STOCK_PRICE(symbol));
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
      // Use API_ENDPOINTS.START_BOT()
      const response = await fetch(API_ENDPOINTS.START_BOT(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) throw new Error('Failed to start bot');

      const data = await response.json();
      const updatedBots = [...activeBots, data];
      setActiveBots(updatedBots);
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
    try {
      // Use API_ENDPOINTS.STOP_BOT(id)
      const response = await fetch(API_ENDPOINTS.STOP_BOT(botId), {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to stop bot');

      const updatedBots = activeBots.filter(bot => bot.bot_id !== botId);
      setActiveBots([...updatedBots]);
      sessionStorage.setItem('activeBots', JSON.stringify(updatedBots));
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
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Trading Configuration</h1>
            <nav className="flex gap-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link href="/trading" className="text-blue-600 font-medium">Trading</Link>
              <Link href="/portfolio" className="text-gray-600 hover:text-gray-900">Portfolio</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          } border`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white shadow-lg rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-6">Configure Trading Bot</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stock Symbol</label>
                  <input
                    type="text"
                    value={config.symbol}
                    onChange={(e) => setConfig({ ...config, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    placeholder="AAPL"
                  />
                  {currentPrice && <p className="mt-1 text-sm text-gray-600">Current Price: ${currentPrice.toFixed(2)}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Trading Strategy</label>
                  <select
                    value={config.strategy}
                    onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    {strategies.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Trading Capital ($)</label>
                  <input
                    type="number"
                    value={config.capital}
                    onChange={(e) => setConfig({ ...config, capital: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Entry (%)</label>
                    <input
                      type="number"
                      value={config.entry_threshold * 100}
                      onChange={(e) => setConfig({ ...config, entry_threshold: parseFloat(e.target.value) / 100 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Exit (%)</label>
                    <input
                      type="number"
                      value={config.exit_threshold * 100}
                      onChange={(e) => setConfig({ ...config, exit_threshold: parseFloat(e.target.value) / 100 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Stop Loss (%)</label>
                    <input
                      type="number"
                      value={config.stop_loss * 100}
                      onChange={(e) => setConfig({ ...config, stop_loss: parseFloat(e.target.value) / 100 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                </div>

                <button
                  onClick={startBot}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                >
                  {loading ? 'Starting Bot...' : 'Start Trading Bot'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white shadow-lg rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Active Bots</h3>
                <button onClick={loadAndVerifyBots} className="text-sm text-blue-600">🔄</button>
              </div>

              {activeBots.length === 0 ? (
                <p className="text-gray-600 text-sm">No active bots.</p>
              ) : (
                <div className="space-y-4">
                  {activeBots.map(bot => (
                    <div key={bot.bot_id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-gray-800">{bot.config.symbol}</p>
                          <p className="text-xs text-gray-500 font-mono truncate max-w-[120px]">{bot.bot_id}</p>
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Active</span>
                      </div>
                      <button
                        onClick={() => stopBot(bot.bot_id)}
                        className="w-full mt-2 bg-red-600 text-white py-2 rounded-lg text-sm"
                      >
                        Stop Bot
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// 2. Main Page Export with Suspense
export default function TradingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading trading interface...</p>
      </div>
    }>
      <TradingContent />
    </Suspense>
  );
}