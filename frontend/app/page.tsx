'use client';

import React, { useState, useEffect } from 'react';
import { SettingsButton } from '@/components/SettingsModal';
import { ControlPanel } from '@/components/ControlPanel';
import { StockList } from '@/components/StockList';
import { useStocks } from '@/hooks/useStocks';
import { useNotifications } from '@/hooks/useNotifications';
import { usePriceHistory } from '@/hooks/usePriceHistory';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { ViewMode } from '@/types/stock';

export default function Dashboard() {
  const {
    stocks,
    loading,
    error,
    timeframe,
    isAutoRefreshing,
    sortColumn,
    setTimeframe,
    toggleAutoRefresh,
    refresh,
    handleSort,
    getSortedStocks,
    getSortIcon,
    formatLastUpdate,
  } = useStocks();

  const {
    notificationsEnabled,
    enableNotifications,
    disableNotifications,
    checkAlertConditions,
  } = useNotifications();

  const {
    loadingSymbol: loadingPriceHistory,
    fetchPriceHistory,
    getPriceHistoryForStock,
  } = usePriceHistory();

  const isMobile = useIsMobile();

  // Initialize view mode based on screen size and localStorage
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  useEffect(() => {
    const saved = localStorage.getItem('stockViewMode') as ViewMode | null;
    if (saved) {
      setViewMode(saved);
    } else {
      setViewMode(isMobile ? 'cards' : 'table');
    }
  }, [isMobile]);

  // Save view mode preference
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('stockViewMode', mode);
  };

  // Check alert conditions when stocks update
  useEffect(() => {
    checkAlertConditions(stocks);
  }, [stocks, checkAlertConditions]);

  const handleNotificationToggle = () => {
    if (notificationsEnabled) {
      disableNotifications();
    } else {
      enableNotifications(stocks);
    }
  };

  const sortedStocks = getSortedStocks();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
              Stock Discovery & Analysis
            </h1>
            <nav className="flex gap-2 sm:gap-4 items-center">
              <a href="/" className="text-blue-600 font-medium hidden sm:block">
                Dashboard
              </a>
              {/* Notification Bell */}
              <button
                onClick={handleNotificationToggle}
                className={`relative p-3 min-h-[44px] min-w-[44px] rounded-lg transition ${
                  notificationsEnabled
                    ? 'bg-green-100 text-green-600 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={notificationsEnabled ? 'Notifications ON (click to disable)' : 'Enable notifications'}
              >
                <span className="text-xl">{notificationsEnabled ? '🔔' : '🔕'}</span>
                {notificationsEnabled && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                )}
              </button>
              <SettingsButton />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ControlPanel
          timeframe={timeframe}
          isAutoRefreshing={isAutoRefreshing}
          viewMode={viewMode}
          lastUpdateText={formatLastUpdate()}
          onTimeframeChange={setTimeframe}
          onToggleAutoRefresh={toggleAutoRefresh}
          onRefresh={refresh}
          onViewModeChange={handleViewModeChange}
        />

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

        {sortedStocks.length > 0 && (
          <StockList
            stocks={sortedStocks}
            timeframe={timeframe}
            sortColumn={sortColumn}
            loading={loading}
            viewMode={viewMode}
            onSort={handleSort}
            getSortIcon={getSortIcon}
            fetchPriceHistory={fetchPriceHistory}
            getPriceHistory={getPriceHistoryForStock}
            loadingPriceHistory={loadingPriceHistory}
          />
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Stock Discovery
            </h3>
            <p className="text-gray-600 text-sm">
              Automatically identifies high-potential stocks based on momentum, volume trends, and price action across multiple timeframes.
            </p>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              News Sentiment
            </h3>
            <p className="text-gray-600 text-sm">
              Real-time news analysis with sentiment scoring. Click &quot;View&quot; on any stock to see latest news and sentiment indicators.
            </p>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
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
