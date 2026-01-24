// Stock-related type definitions

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  published: string | null;
  sentiment: {
    sentiment: string;
    score: number;
    keyword: {
      score: number;
      confidence: number;
    };
    nlp: {
      sentiment: string;
      score: number;
      positive: number;
      negative: number;
      neutral: number;
    };
  };
}

export interface ScoreBreakdown {
  momentum: number;
  volatility: number;
  volume: number;
  technical: number;
  fundamentals: number;
  sentiment: number;
  total: number;
}

export interface Stock {
  symbol: string;
  price: number;
  change: number;
  change_ref_price?: number | null;
  change_ref_datetime?: string | null;
  volume: number;
  potential_score: number;
  trend: string;
  score_breakdown?: ScoreBreakdown;
  news?: NewsItem[];
  news_sentiment?: string;
  news_score?: number;
  // Additional indicators
  pe_ratio?: number | null;
  forward_pe?: number | null;
  eps?: number | null;
  market_cap?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  dividend_yield?: number | null;
  beta?: number | null;
  avg_volume?: number | null;
  profit_margin?: number | null;
  revenue_growth?: number | null;
  price_to_book?: number | null;
}

export interface PriceHistoryItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '1h' | '1d' | '1w';
export type SortColumn = 'trend' | 'potential_score' | 'news_sentiment' | 'pe_ratio' | 'market_cap' | 'dividend_yield' | null;
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'table' | 'cards';
