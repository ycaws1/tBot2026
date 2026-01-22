// lib/api-config.ts or config/api.ts

/**
 * API Configuration
 * Centralized API endpoint management for the trading bot application
 */

// Get API URL from environment variable or use default
const getDefaultApiUrl = (): string => {
  // Priority order:
  // 1. Environment variable (for production/staging)
  // 2. localStorage (for user customization)
  // 3. Default localhost
  
  if (typeof window !== 'undefined') {
    // Client-side: check localStorage first
    const storedUrl = localStorage.getItem('API_BASE_URL');
    if (storedUrl) return storedUrl;
  }
  
  // Check environment variable
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Default fallback
  return 'http://localhost:8000';
};

class ApiConfig {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getDefaultApiUrl();
  }

  /**
   * Get the current API base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Set a new API base URL (stored in localStorage)
   */
  setBaseUrl(url: string): void {
    // Remove trailing slash if present
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    this.baseUrl = cleanUrl;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('API_BASE_URL', cleanUrl);
    }
  }

  /**
   * Reset to default URL
   */
  resetToDefault(): void {
    this.baseUrl = 'http://localhost:8000';
    if (typeof window !== 'undefined') {
      localStorage.removeItem('API_BASE_URL');
    }
  }

  /**
   * Build full endpoint URL
   */
  endpoint(path: string): string {
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Get WebSocket URL
   */
  wsEndpoint(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    return `${wsUrl}${cleanPath}`;
  }
}

// Export singleton instance
export const apiConfig = new ApiConfig();

// Export helper functions for convenience
export const getApiUrl = () => apiConfig.getBaseUrl();
export const setApiUrl = (url: string) => apiConfig.setBaseUrl(url);
export const resetApiUrl = () => apiConfig.resetToDefault();
export const apiEndpoint = (path: string) => apiConfig.endpoint(path);
export const wsEndpoint = (path: string) => apiConfig.wsEndpoint(path);

// Export API endpoints as constants (optional, for better organization)
export const API_ENDPOINTS = {
  // Stocks
  TOP_STOCKS: (n: number, timeframe: string) => 
    apiEndpoint(`/api/stocks/top/${n}?timeframe=${timeframe}`),
  ANALYZE_STOCKS: () => apiEndpoint('/api/stocks/analyze'),
  SEARCH_STOCKS: (query: string, limit: number, timeframe: string) => 
    apiEndpoint(`/api/stocks/search/${query}?limit=${limit}&timeframe=${timeframe}`),
  STOCK_PRICE: (symbol: string) => apiEndpoint(`/api/price/${symbol}`),
  PRICE_HISTORY: (symbol: string, period: string, interval: string = '1d') =>
    apiEndpoint(`/api/history/${symbol}?period=${period}&interval=${interval}`),
  BATCH_PRICES: () => apiEndpoint('/api/stocks/batch-prices'),
  
  // Bots
  START_BOT: () => apiEndpoint('/api/bot/start'),
  STOP_BOT: (botId: string) => apiEndpoint(`/api/bot/stop/${botId}`),
  ACTIVE_BOTS: () => apiEndpoint('/api/bots/active'),
  
  // Portfolio
  PORTFOLIO: (botId: string) => apiEndpoint(`/api/portfolio/${botId}`),
  
  // WebSocket
  WS_PRICES: () => wsEndpoint('/ws/prices'),
};