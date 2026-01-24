'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Stock, Timeframe, SortColumn, ViewMode, PriceHistoryItem } from '@/types/stock';
import { StockTable } from './StockTable';
import { StockCard } from './StockCard';
import { useIsMobile } from '@/hooks/useMediaQuery';

interface StockListProps {
  stocks: Stock[];
  timeframe: Timeframe;
  sortColumn: SortColumn;
  loading: boolean;
  viewMode: ViewMode;
  onSort: (column: SortColumn) => void;
  getSortIcon: (column: SortColumn) => string;
  fetchPriceHistory: (symbol: string, timeframe: Timeframe) => Promise<void>;
  getPriceHistory: (symbol: string, timeframe: Timeframe) => PriceHistoryItem[] | undefined;
  loadingPriceHistory: string | null;
}

export function StockList({
  stocks,
  timeframe,
  sortColumn,
  loading,
  viewMode,
  onSort,
  getSortIcon,
  fetchPriceHistory,
  getPriceHistory,
  loadingPriceHistory,
}: StockListProps) {
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [expandedPriceTrend, setExpandedPriceTrend] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Re-fetch price history when timeframe changes and a price trend is expanded
  useEffect(() => {
    if (expandedPriceTrend) {
      fetchPriceHistory(expandedPriceTrend, timeframe);
    }
  }, [timeframe, expandedPriceTrend, fetchPriceHistory]);

  const toggleExpandStock = useCallback((symbol: string) => {
    setExpandedStock(prev => prev === symbol ? null : symbol);
  }, []);

  const togglePriceTrend = useCallback(async (symbol: string) => {
    if (expandedPriceTrend === symbol) {
      setExpandedPriceTrend(null);
    } else {
      setExpandedPriceTrend(symbol);
      await fetchPriceHistory(symbol, timeframe);
    }
  }, [expandedPriceTrend, fetchPriceHistory, timeframe]);

  const getPriceHistoryForStock = useCallback((symbol: string) => {
    return getPriceHistory(symbol, timeframe);
  }, [getPriceHistory, timeframe]);

  // Show cards view
  if (viewMode === 'cards') {
    return (
      <div className="space-y-4">
        {stocks.map((stock) => (
          <StockCard
            key={stock.symbol}
            stock={stock}
            timeframe={timeframe}
            isExpanded={expandedStock === stock.symbol}
            isPriceTrendExpanded={expandedPriceTrend === stock.symbol}
            priceHistory={getPriceHistoryForStock(stock.symbol)}
            isLoadingPriceHistory={loadingPriceHistory === stock.symbol}
            onToggleExpand={() => toggleExpandStock(stock.symbol)}
            onTogglePriceTrend={() => togglePriceTrend(stock.symbol)}
          />
        ))}
      </div>
    );
  }

  // Show table view
  return (
    <StockTable
      stocks={stocks}
      timeframe={timeframe}
      sortColumn={sortColumn}
      expandedStock={expandedStock}
      expandedPriceTrend={expandedPriceTrend}
      loadingPriceHistory={loadingPriceHistory}
      loading={loading}
      onSort={onSort}
      getSortIcon={getSortIcon}
      onToggleExpand={toggleExpandStock}
      onTogglePriceTrend={togglePriceTrend}
      getPriceHistory={getPriceHistoryForStock}
    />
  );
}
