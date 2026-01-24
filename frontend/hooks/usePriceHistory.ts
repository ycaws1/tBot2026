'use client';

import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/api-config';
import type { PriceHistoryItem, Timeframe } from '@/types/stock';

interface UsePriceHistoryReturn {
  priceHistory: Record<string, PriceHistoryItem[]>;
  loadingSymbol: string | null;
  fetchPriceHistory: (symbol: string, timeframe: Timeframe) => Promise<void>;
  getPriceHistoryForStock: (symbol: string, timeframe: Timeframe) => PriceHistoryItem[] | undefined;
}

export function getTimeframeParams(tf: Timeframe): { period: string; interval: string; label: string } {
  switch (tf) {
    case '1m': return { period: '2d', interval: '1m', label: 'Last 2 Days (1-min intervals)' };
    case '1h': return { period: '5d', interval: '1h', label: 'Last 5 Days (Hourly)' };
    case '1d': return { period: '1mo', interval: '1d', label: 'Last Month (Daily)' };
    case '1w': return { period: '6mo', interval: '1wk', label: 'Last 6 Months (Weekly)' };
    default: return { period: '1mo', interval: '1d', label: 'Last Month (Daily)' };
  }
}

export function usePriceHistory(): UsePriceHistoryReturn {
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistoryItem[]>>({});
  const [loadingSymbol, setLoadingSymbol] = useState<string | null>(null);

  const fetchPriceHistory = useCallback(async (symbol: string, timeframe: Timeframe) => {
    const cacheKey = `${symbol}-${timeframe}`;

    // Return early if already cached
    if (priceHistory[cacheKey]) return;

    setLoadingSymbol(symbol);
    try {
      const { period, interval } = getTimeframeParams(timeframe);
      const response = await fetch(API_ENDPOINTS.PRICE_HISTORY(symbol, period, interval));
      if (!response.ok) throw new Error('Failed to fetch price history');
      const data = await response.json();
      setPriceHistory(prev => ({ ...prev, [cacheKey]: data }));
    } catch (err) {
      console.error('Failed to fetch price history:', err);
    } finally {
      setLoadingSymbol(null);
    }
  }, [priceHistory]);

  const getPriceHistoryForStock = useCallback((symbol: string, timeframe: Timeframe): PriceHistoryItem[] | undefined => {
    const cacheKey = `${symbol}-${timeframe}`;
    return priceHistory[cacheKey];
  }, [priceHistory]);

  return {
    priceHistory,
    loadingSymbol,
    fetchPriceHistory,
    getPriceHistoryForStock,
  };
}
