'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/api-config';
import type { Stock, Timeframe, SortColumn, SortDirection } from '@/types/stock';

interface UseStocksReturn {
  stocks: Stock[];
  loading: boolean;
  error: string | null;
  timeframe: Timeframe;
  lastUpdate: Date | null;
  isAutoRefreshing: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  setTimeframe: (tf: Timeframe) => void;
  toggleAutoRefresh: () => void;
  refresh: () => void;
  handleSort: (column: SortColumn) => void;
  getSortedStocks: () => Stock[];
  getSortIcon: (column: SortColumn) => string;
  formatLastUpdate: () => string;
}

export function useStocks(): UseStocksReturn {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const fetchedRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTopStocks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.TOP_STOCKS_WITH_NEWS(21, timeframe));
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
  }, [timeframe]);

  // Initial fetch
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchTopStocks();
  }, [fetchTopStocks]);

  // Fetch when timeframe changes
  useEffect(() => {
    if (fetchedRef.current) {
      fetchTopStocks();
    }
  }, [timeframe, fetchTopStocks]);

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
  }, [isAutoRefreshing, fetchTopStocks]);

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

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  const getSortedStocks = useCallback(() => {
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
  }, [stocks, sortColumn, sortDirection]);

  const getSortIcon = useCallback((column: SortColumn) => {
    if (sortColumn !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  }, [sortColumn, sortDirection]);

  const formatLastUpdate = useCallback(() => {
    if (!lastUpdate) return 'Never';
    const diff = Math.floor((currentTime.getTime() - lastUpdate.getTime()) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastUpdate.toLocaleTimeString();
  }, [lastUpdate, currentTime]);

  const toggleAutoRefresh = useCallback(() => {
    setIsAutoRefreshing(prev => !prev);
  }, []);

  const refresh = useCallback(() => {
    fetchTopStocks();
  }, [fetchTopStocks]);

  return {
    stocks,
    loading,
    error,
    timeframe,
    lastUpdate,
    isAutoRefreshing,
    sortColumn,
    sortDirection,
    setTimeframe,
    toggleAutoRefresh,
    refresh,
    handleSort,
    getSortedStocks,
    getSortIcon,
    formatLastUpdate,
  };
}
