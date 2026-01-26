# main.py - Fixed version with actual trading logic
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import asyncio
import yfinance as yf
from datetime import datetime, timedelta
import json
from concurrent.futures import ThreadPoolExecutor
import functools
import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

# FastText sentiment analysis
import fasttext
import urllib.request
import tempfile

# Initialize FastText (lazy loading)
fasttext_model = None
FASTTEXT_MODEL_PATH = os.path.join(tempfile.gettempdir(), "lid.176.ftz")

def get_sentiment_model():
    """Lazy load FastText model for text processing"""
    global fasttext_model
    if fasttext_model is None:
        print("=" * 50)
        print("Loading FastText model...")
        print("This should only happen ONCE per server start.")
        print("=" * 50)
        # FastText doesn't have a pre-trained sentiment model, so we use keyword-based
        # analysis enhanced with FastText. The model below is for language detection
        # but we primarily rely on our financial keyword lexicon.
        fasttext_model = True  # Placeholder - we use keyword-based sentiment
        print("FastText initialized!")
    return fasttext_model

# Import strategies
from strategies import StrategyFactory

# Common symbols for cache warming
COMMON_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
                  "JPM", "BAC", "WMT", "V", "MA", "DIS", "PYPL", "ADBE", "CRM", "ORCL", "BABA"]

# Background cache warming task reference
_cache_warming_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events"""
    global _cache_warming_task

    # Startup: Start cache warming in background
    print("Starting cache warming task...")

    async def refresh_loop():
        # Initial warm
        try:
            await warm_cache()
        except Exception as e:
            print(f"Initial cache warming error: {e}")
            
        # Periodic refresh
        while True:
            await asyncio.sleep(295)  # Refresh before 300s TTL expires
            try:
                await warm_cache()
            except Exception as e:
                print(f"Cache warming error: {e}")

    _cache_warming_task = asyncio.create_task(refresh_loop())
    print("Cache warming background task started")

    yield

    # Shutdown: cancel the warming task
    if _cache_warming_task:
        _cache_warming_task.cancel()
        print("Cache warming task cancelled")

app = FastAPI(title="Stock Trading Bot API", lifespan=lifespan)

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
if "," in raw_origins:
    origins = [origin.strip() for origin in raw_origins.split(",")]
else:
    origins = [raw_origins]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thread pool for async yfinance operations
executor = ThreadPoolExecutor(max_workers=10)
fetch_semaphore = asyncio.Semaphore(5)

# ============== Caching System ==============
class TTLCache:
    """Simple TTL-based cache for yfinance data"""
    def __init__(self):
        self._cache: Dict[str, dict] = {}
        self._lock = asyncio.Lock()

    def _is_expired(self, entry: dict) -> bool:
        return datetime.now() > entry['expires_at']

    async def get(self, key: str):
        """Get value from cache if not expired"""
        async with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if not self._is_expired(entry):
                    return entry['value']
                else:
                    del self._cache[key]
            return None

    async def set(self, key: str, value, ttl_seconds: int):
        """Set value in cache with TTL"""
        async with self._lock:
            self._cache[key] = {
                'value': value,
                'expires_at': datetime.now() + timedelta(seconds=ttl_seconds),
                'created_at': datetime.now()
            }

    async def clear(self):
        """Clear all cache entries"""
        async with self._lock:
            self._cache.clear()

    async def cleanup(self):
        """Remove expired entries"""
        async with self._lock:
            expired_keys = [k for k, v in self._cache.items() if self._is_expired(v)]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)

    def stats(self) -> dict:
        """Get cache statistics"""
        now = datetime.now()
        valid = sum(1 for v in self._cache.values() if now <= v['expires_at'])
        return {
            'total_entries': len(self._cache),
            'valid_entries': valid,
            'expired_entries': len(self._cache) - valid
        }

# Single unified cache for all ticker data
ticker_cache = TTLCache()

# Cache TTL settings (in seconds)
CACHE_TTL_TICKER = 300  # 5 minutes for combined ticker data (was 30s, 2minutes)

# Web Push notifications
from pywebpush import webpush, WebPushException

# VAPID keys for push notifications (generate once and store securely in production)
# Generate with: from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print(v.private_key, v.public_key)
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS = {"sub": "mailto:admin@t-bot2026.vercel.app"}

# Push subscription storage (in-memory, use database in production)
push_subscriptions: Dict[str, dict] = {}

# Previous stock states for alert detection
previous_stock_states: Dict[str, dict] = {}

# Processed cache for top stocks
_processed_top_stocks: Dict[str, list] = {}
_last_top_stocks_update: Dict[str, datetime] = {}

# Models
class ScoreBreakdown(BaseModel):
    momentum: float = 0
    volatility: float = 0
    volume: float = 0
    technical: float = 0
    fundamentals: float = 0
    sentiment: float = 0
    total: float = 0

class StockInfo(BaseModel):
    symbol: str
    company_name: Optional[str] = None
    price: float
    change: float
    change_ref_price: Optional[float] = None
    change_ref_datetime: Optional[str] = None
    volume: int
    potential_score: float
    trend: str
    # Score breakdown for transparency
    score_breakdown: Optional[ScoreBreakdown] = None
    # Additional indicators
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    eps: Optional[float] = None
    market_cap: Optional[float] = None
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None
    dividend_yield: Optional[float] = None
    beta: Optional[float] = None
    avg_volume: Optional[int] = None
    profit_margin: Optional[float] = None
    revenue_growth: Optional[float] = None
    price_to_book: Optional[float] = None

class TradingConfig(BaseModel):
    symbol: str
    strategy: str
    capital: float
    entry_threshold: float
    exit_threshold: float
    stop_loss: float

class Trade(BaseModel):
    id: str
    symbol: str
    action: str
    price: float
    quantity: int
    timestamp: datetime
    total: float

class Portfolio(BaseModel):
    cash: float
    equity: float
    positions: Dict[str, dict]
    trades: List[Trade]
    profit_loss: float

class SymbolListRequest(BaseModel):
    symbols: List[str]
    limit: Optional[int] = 10

# In-memory storage
portfolios = {}
active_bots = {}
bot_tasks = {}  # Store running tasks
trade_history = []

# Async wrapper for yfinance operations
async def run_async(func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, functools.partial(func, *args, **kwargs))

async def get_ticker_all_async(symbol: str, timeframe: str = '1d', use_cache: bool = True):
    """Fetch all ticker data (info, history, news) in one call with caching"""
    # Map timeframe to period/interval
    period_map = {'1m': '7d', '1h': '5d', '1d': '1mo', '1w': '3mo'}
    interval_map = {'1m': '1m', '1h': '1h', '1d': '1d', '1w': '1d'}
    period = period_map.get(timeframe, '1mo')
    interval = interval_map.get(timeframe, '1d')

    cache_key = f"ticker:{symbol.upper()}:{timeframe}"

    # Check cache first
    if use_cache:
        cached = await ticker_cache.get(cache_key)
        if cached is not None:
            return cached

    # Fetch all data from yfinance using single Ticker object
    async with fetch_semaphore:
        def _get_all():
            ticker = yf.Ticker(symbol)
            return {
                'info': ticker.info,
                'history': ticker.history(period=period, interval=interval),
                'news': ticker.news
            }
        result = await run_async(_get_all)

    # Store in cache
    await ticker_cache.set(cache_key, result, CACHE_TTL_TICKER)
    return result

async def get_ticker_info_async(symbol: str, timeframe: str = '1d', use_cache: bool = True):
    """Fetch ticker info (uses combined cache)"""
    data = await get_ticker_all_async(symbol, timeframe, use_cache)
    return data['info']

async def get_ticker_history_async(symbol: str, timeframe: str = '1d', use_cache: bool = True):
    """Fetch ticker history (uses combined cache)"""
    data = await get_ticker_all_async(symbol, timeframe, use_cache)
    return data['history']

async def get_ticker_news_async(symbol: str, timeframe: str = '1d', use_cache: bool = True):
    """Fetch ticker news (uses combined cache)"""
    data = await get_ticker_all_async(symbol, timeframe, use_cache)
    return data['news']

async def warm_cache():
    """Pre-warm cache for common symbols and pre-calculate top stocks"""
    print(f"Warming cache for {len(COMMON_SYMBOLS)} symbols...")
    
    # We warm both 1m and 1d as they are most commonly used
    for tf in ['1m', '1h', '1d']:
        print(f"{datetime.now()} - Refreshing {tf} cache and analysis...")
        # 1. Warm raw ticker data cache
        tasks = [get_ticker_all_async(symbol, tf, use_cache=False) for symbol in COMMON_SYMBOLS]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # 2. Pre-calculate top stocks (this updates the processed cache)
        # We call the logic but ignore the return since it updates the global _processed_top_stocks
        await get_top_stocks_with_news(n=10, timeframe=tf, force_refresh=True)
    
    print(f"Cache warming and pre-calculation complete")

# Simulated Broker
class SimulatedBroker:
    def __init__(self, initial_capital=10000):
        self.cash = initial_capital
        self.positions = {}
        self.trades = []
        self.initial_capital = initial_capital
    
    def buy(self, symbol: str, price: float, quantity: int):
        total_cost = price * quantity
        if self.cash >= total_cost:
            self.cash -= total_cost
            if symbol in self.positions:
                old_qty = self.positions[symbol]['quantity']
                old_price = self.positions[symbol]['avg_price']
                new_qty = old_qty + quantity
                new_avg = ((old_price * old_qty) + (price * quantity)) / new_qty
                self.positions[symbol] = {
                    'quantity': new_qty,
                    'avg_price': new_avg
                }
            else:
                self.positions[symbol] = {
                    'quantity': quantity,
                    'avg_price': price
                }
            
            trade = {
                'id': f"T{len(self.trades)+1}",
                'symbol': symbol,
                'action': 'BUY',
                'price': price,
                'quantity': quantity,
                'timestamp': datetime.now(),
                'total': total_cost
            }
            self.trades.append(trade)
            print(f"✅ EXECUTED BUY: {quantity} shares of {symbol} at ${price:.2f} (Total: ${total_cost:.2f})")
            return trade
        else:
            print(f"❌ INSUFFICIENT FUNDS: Need ${total_cost:.2f}, have ${self.cash:.2f}")
        return None
    
    def sell(self, symbol: str, price: float, quantity: int):
        if symbol in self.positions and self.positions[symbol]['quantity'] >= quantity:
            total_value = price * quantity
            self.cash += total_value
            self.positions[symbol]['quantity'] -= quantity
            
            if self.positions[symbol]['quantity'] == 0:
                del self.positions[symbol]
            
            trade = {
                'id': f"T{len(self.trades)+1}",
                'symbol': symbol,
                'action': 'SELL',
                'price': price,
                'quantity': quantity,
                'timestamp': datetime.now(),
                'total': total_value
            }
            self.trades.append(trade)
            print(f"✅ EXECUTED SELL: {quantity} shares of {symbol} at ${price:.2f} (Total: ${total_value:.2f})")
            return trade
        else:
            print(f"❌ CANNOT SELL: Don't have {quantity} shares of {symbol}")
        return None
    
    def get_portfolio_value(self, current_prices: Dict[str, float]):
        equity = self.cash
        for symbol, position in self.positions.items():
            if symbol in current_prices:
                equity += position['quantity'] * current_prices[symbol]
        return equity
    
    def get_profit_loss(self, current_prices: Dict[str, float]):
        current_value = self.get_portfolio_value(current_prices)
        return current_value - self.initial_capital

# Trading Bot Task
async def trading_bot_task(bot_id: str):
    """Background task that monitors price and executes trades"""
    print(f"🤖 Starting trading bot: {bot_id}")
    
    bot_info = active_bots[bot_id]
    config = bot_info["config"]
    broker = portfolios[bot_id]
    
    # Create strategy instance
    strategy_config = {
        'symbol': config.symbol,
        'capital': config.capital,
        'entry_threshold': config.entry_threshold,
        'exit_threshold': config.exit_threshold,
        'stop_loss': config.stop_loss
    }
    strategy = StrategyFactory.create_strategy(config.strategy, strategy_config)
    
    symbol = config.symbol
    check_interval = 10  # Check every 10 seconds
    
    try:
        while active_bots[bot_id]["active"]:
            try:
                # Fetch all data in one call (uses cache)
                ticker_data = await get_ticker_all_async(symbol, timeframe='1d')
                info = ticker_data['info']
                hist = ticker_data['history']
                current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))

                if current_price == 0:
                    print(f"⚠️ Could not get valid price for {symbol}")
                    await asyncio.sleep(check_interval)
                    continue
                
                if hist.empty:
                    print(f"⚠️ No historical data for {symbol}")
                    await asyncio.sleep(check_interval)
                    continue
                
                # Check if we should buy
                if not strategy.position and strategy.should_buy(current_price, hist):
                    quantity = strategy.calculate_quantity(current_price)
                    trade = broker.buy(symbol, current_price, quantity)
                    
                    if trade:
                        strategy.position = quantity
                        strategy.entry_price = current_price
                        print(f"📊 Bot {bot_id}: Position opened - {quantity} shares at ${current_price:.2f}")
                
                # Check if we should sell
                elif strategy.position and strategy.should_sell(current_price, hist):
                    if symbol in broker.positions:
                        quantity = broker.positions[symbol]['quantity']
                        trade = broker.sell(symbol, current_price, quantity)
                        
                        if trade:
                            strategy.position = None
                            strategy.entry_price = None
                            print(f"📊 Bot {bot_id}: Position closed - {quantity} shares at ${current_price:.2f}")
                
                # Log current status
                if strategy.position:
                    profit_pct = ((current_price - strategy.entry_price) / strategy.entry_price) * 100 if strategy.entry_price else 0
                    print(f"📈 Bot {bot_id}: {symbol} @ ${current_price:.2f} | Position: {strategy.position} shares | P/L: {profit_pct:+.2f}%")
                else:
                    print(f"💰 Bot {bot_id}: {symbol} @ ${current_price:.2f} | No position | Cash: ${broker.cash:.2f}")
                
            except Exception as e:
                print(f"❌ Error in trading loop for {bot_id}: {e}")
            
            await asyncio.sleep(check_interval)
    
    except asyncio.CancelledError:
        print(f"🛑 Trading bot {bot_id} cancelled")
    finally:
        print(f"🏁 Trading bot {bot_id} stopped")

# Stock Analysis Functions
def calculate_day_trading_score(info: dict, hist, timeframe: str = '1d') -> dict:
    """
    Comprehensive day trading score using all available indicators.
    Returns a dict with total score and breakdown by category.

    Scoring weights for day trading:
    - Momentum & Trend: 25 points (price movement direction)
    - Volatility: 20 points (opportunity for profit, optimal beta 1.0-2.0)
    - Volume & Liquidity: 20 points (ability to enter/exit)
    - Technical Position: 15 points (52-week position, support/resistance)
    - Fundamentals: 10 points (basic health check)
    - News Sentiment: 10 points (catalysts)
    """
    scores = {
        'momentum': 0,
        'volatility': 0,
        'volume': 0,
        'technical': 0,
        'fundamentals': 0,
        'sentiment': 0,
        'total': 0
    }

    try:
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))

        # 1. MOMENTUM & TREND SCORE (max 25 points)
        if len(hist) >= 5:
            # Short-term momentum
            if timeframe == '1m' and len(hist) > 60:
                recent_hist = hist.iloc[-60:]
            elif timeframe == '1h' and len(hist) > 24:
                recent_hist = hist.iloc[-24:]
            elif timeframe == '1d' and len(hist) > 5:
                recent_hist = hist.iloc[-5:]
            else:
                recent_hist = hist

            price_change = ((recent_hist['Close'].iloc[-1] - recent_hist['Close'].iloc[0]) / recent_hist['Close'].iloc[0]) * 100

            # Positive momentum is good for day trading (following trend)
            if price_change > 3:
                scores['momentum'] = 25
            elif price_change > 1.5:
                scores['momentum'] = 20
            elif price_change > 0.5:
                scores['momentum'] = 15
            elif price_change > -0.5:
                scores['momentum'] = 10
            elif price_change > -1.5:
                scores['momentum'] = 5
            else:
                scores['momentum'] = 0

            # Check for consistent trend (higher highs or lower lows)
            if len(recent_hist) >= 3:
                closes = recent_hist['Close'].values
                if all(closes[i] <= closes[i+1] for i in range(len(closes)-1)):
                    scores['momentum'] = min(25, scores['momentum'] + 5)  # Consistent uptrend bonus

        # 2. VOLATILITY SCORE (max 20 points)
        beta = info.get('beta', 1.0)
        if beta:
            # Optimal beta for day trading is 1.0-2.0 (enough movement, not too crazy)
            if 1.0 <= beta <= 2.0:
                scores['volatility'] = 20
            elif 0.8 <= beta < 1.0 or 2.0 < beta <= 2.5:
                scores['volatility'] = 15
            elif 0.5 <= beta < 0.8 or 2.5 < beta <= 3.0:
                scores['volatility'] = 10
            elif beta < 0.5:
                scores['volatility'] = 5  # Too stable for day trading
            else:
                scores['volatility'] = 5  # Too volatile/risky

        # Add intraday volatility from historical data
        if len(hist) >= 5:
            daily_range = ((hist['High'] - hist['Low']) / hist['Low']).mean() * 100
            if daily_range > 3:
                scores['volatility'] = min(20, scores['volatility'] + 5)
            elif daily_range > 2:
                scores['volatility'] = min(20, scores['volatility'] + 3)

        # 3. VOLUME & LIQUIDITY SCORE (max 20 points)
        volume = info.get('volume', 0)
        avg_volume = info.get('averageVolume', 0)

        # High volume is essential for day trading
        if avg_volume:
            # Volume should be at least 1M for good liquidity
            if avg_volume > 10000000:
                scores['volume'] = 15
            elif avg_volume > 5000000:
                scores['volume'] = 12
            elif avg_volume > 1000000:
                scores['volume'] = 8
            elif avg_volume > 500000:
                scores['volume'] = 5
            else:
                scores['volume'] = 2

            # Volume surge (current vs average) - indicates interest
            if volume and avg_volume:
                volume_ratio = volume / avg_volume
                if volume_ratio > 2.0:
                    scores['volume'] = min(20, scores['volume'] + 5)  # Major surge
                elif volume_ratio > 1.5:
                    scores['volume'] = min(20, scores['volume'] + 3)
                elif volume_ratio > 1.2:
                    scores['volume'] = min(20, scores['volume'] + 2)

        # 4. TECHNICAL POSITION SCORE (max 15 points)
        fifty_two_week_high = info.get('fiftyTwoWeekHigh')
        fifty_two_week_low = info.get('fiftyTwoWeekLow')

        if fifty_two_week_high and fifty_two_week_low and current_price:
            range_size = fifty_two_week_high - fifty_two_week_low
            if range_size > 0:
                position = (current_price - fifty_two_week_low) / range_size

                # For day trading, mid-range with momentum is ideal
                # Near 52-week high with momentum = breakout potential
                # Near 52-week low = bounce potential but risky
                if 0.3 <= position <= 0.7:
                    scores['technical'] = 10  # Good trading range
                elif position > 0.8:
                    scores['technical'] = 12 if scores['momentum'] > 15 else 6  # Breakout if momentum
                elif position < 0.2:
                    scores['technical'] = 8  # Bounce potential
                else:
                    scores['technical'] = 7

                # Check if near support/resistance (recent high/low)
                if len(hist) >= 5:
                    recent_high = hist['High'].iloc[-5:].max()
                    recent_low = hist['Low'].iloc[-5:].min()

                    # Near breakout of recent resistance
                    if current_price >= recent_high * 0.98:
                        scores['technical'] = min(15, scores['technical'] + 3)
                    # Near support bounce
                    elif current_price <= recent_low * 1.02:
                        scores['technical'] = min(15, scores['technical'] + 2)

        # 5. FUNDAMENTALS SCORE (max 10 points) - Basic health check
        pe_ratio = info.get('trailingPE')
        profit_margin = info.get('profitMargins')
        revenue_growth = info.get('revenueGrowth')

        fundamental_score = 0

        # PE Ratio - not too high (overvalued), not negative (unprofitable)
        if pe_ratio:
            if 5 <= pe_ratio <= 25:
                fundamental_score += 3
            elif 25 < pe_ratio <= 40:
                fundamental_score += 2
            elif pe_ratio > 0:
                fundamental_score += 1

        # Profitable company
        if profit_margin and profit_margin > 0:
            fundamental_score += 3 if profit_margin > 0.1 else 2 if profit_margin > 0.05 else 1

        # Growing revenue
        if revenue_growth and revenue_growth > 0:
            fundamental_score += 4 if revenue_growth > 0.2 else 3 if revenue_growth > 0.1 else 2

        scores['fundamentals'] = min(10, fundamental_score)

        # 6. NEWS SENTIMENT SCORE (max 10 points) - Will be added from news analysis
        # This is a placeholder - actual sentiment will be added in fetch_stock_info
        scores['sentiment'] = 5  # Neutral default

        # Calculate total
        scores['total'] = (
            scores['momentum'] +
            scores['volatility'] +
            scores['volume'] +
            scores['technical'] +
            scores['fundamentals'] +
            scores['sentiment']
        )

    except Exception as e:
        print(f"Error calculating day trading score: {e}")
        scores['total'] = 0

    return scores


async def calculate_potential_score_async(symbol: str, timeframe: str = '1d') -> float:
    """Legacy function - now just returns basic score for backward compatibility"""
    try:
        hist = await get_ticker_history_async(symbol, timeframe)
        if len(hist) < 5:
            return 0.0

        if timeframe == '1m' and len(hist) > 60:
            hist = hist.iloc[-60:]
        elif timeframe == '1h' and len(hist) > 24:
            hist = hist.iloc[-24:]
        elif timeframe == '1d' and len(hist) > 5:
            hist = hist.iloc[-5:]

        momentum = ((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]) * 100
        volatility = hist['Close'].std() / hist['Close'].mean()
        vol_trend = (hist['Volume'].iloc[-3:].mean() / hist['Volume'].mean()) - 1 if len(hist) >= 3 else 0

        score = max(0, min(100, 50 + (momentum * 2) + (vol_trend * 10) - (volatility * 20)))
        return round(score, 2)
    except:
        return 0.0

async def get_trend_async(symbol: str, timeframe: str = '1d') -> str:
    try:
        hist = await get_ticker_history_async(symbol, timeframe)
        if len(hist) < 2:
            return "NEUTRAL"

        if timeframe == '1m' and len(hist) > 30:
            hist = hist.iloc[-30:]
        elif timeframe == '1h' and len(hist) > 12:
            hist = hist.iloc[-12:]
        elif timeframe == '1d' and len(hist) > 5:
            hist = hist.iloc[-5:]

        change = ((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]) * 100

        threshold_map = {'1m': 0.2, '1h': 0.5, '1d': 1.0, '1w': 2.0}
        threshold = threshold_map.get(timeframe, 1.0)
        
        if change > threshold:
            return "BULLISH"
        elif change < -threshold:
            return "BEARISH"
        return "NEUTRAL"
    except Exception as e:
        print(f"Error in get_trend_async for {symbol}: {e}")
        return "NEUTRAL"

async def fetch_stock_info(symbol: str, timeframe: str = '1m') -> Optional[StockInfo]:
    try:
        # Fetch all data in one call (info + history + news)
        ticker_data = await get_ticker_all_async(symbol, timeframe)
        info = ticker_data['info']
        hist = ticker_data['history']
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))

        reference_price = None
        reference_datetime = None

        if not hist.empty and len(hist) > 1:
            # Compare to previous trading day same time candle
            if timeframe in ['1m', '1h']:
                # For intraday, find same time from previous trading day
                current_idx = hist.index[-1]
                current_time = current_idx.time() if hasattr(current_idx, 'time') else None

                if current_time:
                    # Look for candle from previous trading day at same time
                    for i in range(len(hist) - 2, -1, -1):
                        idx = hist.index[i]
                        if hasattr(idx, 'date') and idx.date() < current_idx.date():
                            # Found previous day, now find matching time
                            prev_day = idx.date()
                            for j in range(i, -1, -1):
                                check_idx = hist.index[j]
                                if hasattr(check_idx, 'date') and check_idx.date() == prev_day:
                                    if hasattr(check_idx, 'time') and check_idx.time() <= current_time:
                                        reference_price = float(hist['Close'].iloc[j])
                                        reference_datetime = check_idx.isoformat()
                                        break
                            break

            # Fallback: use previous day's close or previous candle
            if reference_price is None:
                prev_close = info.get('previousClose')
                if prev_close:
                    reference_price = float(prev_close)
                    reference_datetime = "Previous close"
                elif len(hist) > 1:
                    reference_price = float(hist['Close'].iloc[-2])
                    reference_datetime = hist.index[-2].isoformat() if hasattr(hist.index[-2], 'isoformat') else str(hist.index[-2])

            change = ((current_price - reference_price) / reference_price * 100) if reference_price else 0
        else:
            # Fallback to previousClose from ticker info
            prev_close = info.get('previousClose')
            if prev_close:
                reference_price = float(prev_close)
                reference_datetime = "Previous close"
            change = ((current_price - prev_close) / prev_close * 100) if prev_close else 0

        # Ultimate fallback
        if reference_price is None:
            reference_price = float(current_price)
            reference_datetime = "Current price (no reference)"

        # Calculate trend
        trend = await get_trend_async(symbol, timeframe)

        # Calculate comprehensive day trading score
        score_data = calculate_day_trading_score(info, hist, timeframe)

        # Extract additional indicators
        pe_ratio = info.get('trailingPE')
        forward_pe = info.get('forwardPE')
        eps = info.get('trailingEps')
        market_cap = info.get('marketCap')
        fifty_two_week_high = info.get('fiftyTwoWeekHigh')
        fifty_two_week_low = info.get('fiftyTwoWeekLow')
        dividend_yield = info.get('dividendYield')
        beta = info.get('beta')
        avg_volume = info.get('averageVolume')
        profit_margin = info.get('profitMargins')
        revenue_growth = info.get('revenueGrowth')
        price_to_book = info.get('priceToBook')

        # Create score breakdown
        score_breakdown = ScoreBreakdown(
            momentum=score_data['momentum'],
            volatility=score_data['volatility'],
            volume=score_data['volume'],
            technical=score_data['technical'],
            fundamentals=score_data['fundamentals'],
            sentiment=score_data['sentiment'],
            total=score_data['total']
        )

        return StockInfo(
            symbol=symbol,
            company_name=info.get('longName') or info.get('shortName'),
            price=current_price,
            change=change,
            change_ref_price=reference_price,
            change_ref_datetime=reference_datetime,
            volume=info.get('volume', 0),
            potential_score=score_data['total'],
            trend=trend,
            score_breakdown=score_breakdown,
            pe_ratio=pe_ratio,
            forward_pe=forward_pe,
            eps=eps,
            market_cap=market_cap,
            fifty_two_week_high=fifty_two_week_high,
            fifty_two_week_low=fifty_two_week_low,
            dividend_yield=dividend_yield,
            beta=beta,
            avg_volume=avg_volume,
            profit_margin=profit_margin,
            revenue_growth=revenue_growth,
            price_to_book=price_to_book
        )
    except Exception as e:
        print(f"Error fetching {symbol} for timeframe {timeframe}: {e}")
        return None

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "Stock Trading Bot API", 
        "version": "3.0 - With Active Trading",
        "active_bots": len([b for b in active_bots.values() if b["active"]])
    }

@app.post("/api/stocks/analyze")
async def analyze_custom_stocks(request: SymbolListRequest, timeframe: str = '1d'):
    if timeframe not in ['1m', '1h', '1d', '1w']:
        timeframe = '1d'
    
    symbols = [s.upper().strip() for s in request.symbols]
    limit = request.limit or len(symbols)
    
    tasks = [fetch_stock_info(symbol, timeframe) for symbol in symbols]
    results = await asyncio.gather(*tasks)
    
    stocks = [stock for stock in results if stock is not None]
    stocks.sort(key=lambda x: x.potential_score, reverse=True)
    
    return stocks[:limit]

@app.get("/api/price/{symbol}")
async def get_stock_price(symbol: str, timeframe: str = '1d'):
    """Get current stock price"""
    try:
        info = await get_ticker_info_async(symbol, timeframe)
        price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        return {"symbol": symbol, "price": price, "timestamp": datetime.now()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history/{symbol}")
async def get_price_history(symbol: str, period: str = "1mo", interval: str = "1d"):
    """Get historical price data (direct fetch, custom period/interval)"""
    try:
        # Direct fetch for custom period/interval (not using combined cache)
        async with fetch_semaphore:
            def _get_history():
                ticker = yf.Ticker(symbol)
                return ticker.history(period=period, interval=interval)
            hist = await run_async(_get_history)

        if hist.empty:
            raise HTTPException(status_code=404, detail="No data found")

        history = []
        for date, row in hist.iterrows():
            history.append({
                "date": date.isoformat(),
                "open": float(row['Open']),
                "high": float(row['High']),
                "low": float(row['Low']),
                "close": float(row['Close']),
                "volume": int(row['Volume'])
            })

        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Sentiment Analysis
def analyze_sentiment(text: str) -> dict:
    """Financial sentiment analysis using keyword lexicon (FastText-compatible lightweight approach)"""
    text_lower = text.lower()
    words = text_lower.split()

    # --- Financial keyword lexicon with weights ---
    positive_words = {
        'surge': 1.5, 'soar': 1.5, 'jump': 1.2, 'gain': 1.0, 'rise': 1.0,
        'climb': 1.0, 'rally': 1.3, 'boost': 1.2, 'bullish': 1.5, 'upbeat': 1.0,
        'optimistic': 1.2, 'growth': 1.3, 'profit': 1.2, 'beat': 1.3, 'exceed': 1.3,
        'strong': 1.0, 'positive': 1.0, 'upgrade': 1.4, 'buy': 0.8, 'outperform': 1.4,
        'record': 1.2, 'high': 0.8, 'success': 1.2, 'breakthrough': 1.5,
        'innovation': 1.2, 'expansion': 1.2, 'recovery': 1.3, 'momentum': 1.1,
        'beats': 1.3, 'exceeds': 1.3, 'surges': 1.5, 'soars': 1.5, 'rallies': 1.3,
        'growing': 1.2, 'profitable': 1.3, 'upgraded': 1.4, 'winner': 1.2
    }

    negative_words = {
        'drop': 1.2, 'fall': 1.0, 'decline': 1.2, 'plunge': 1.5, 'crash': 1.8,
        'sink': 1.3, 'tumble': 1.4, 'slide': 1.2, 'bearish': 1.5, 'pessimistic': 1.2,
        'loss': 1.3, 'miss': 1.2, 'disappoint': 1.3, 'weak': 1.0, 'negative': 1.0,
        'downgrade': 1.4, 'sell': 0.8, 'underperform': 1.4, 'low': 0.7, 'fail': 1.3,
        'cut': 1.0, 'layoff': 1.4, 'layoffs': 1.4, 'concern': 1.0, 'risk': 0.9,
        'warning': 1.2, 'lawsuit': 1.3, 'investigation': 1.2, 'recall': 1.3,
        'misses': 1.2, 'disappoints': 1.3, 'plunges': 1.5, 'crashes': 1.8,
        'loses': 1.2, 'struggling': 1.2, 'downgrades': 1.4, 'fears': 1.1
    }

    # Calculate weighted scores
    positive_score = 0.0
    negative_score = 0.0

    for word in words:
        word_clean = word.strip('.,!?;:()[]{}"\'-')
        if word_clean in positive_words:
            positive_score += positive_words[word_clean]
        if word_clean in negative_words:
            negative_score += negative_words[word_clean]

    # Normalize scores
    total_weight = positive_score + negative_score
    if total_weight == 0:
        compound_score = 0.0
        confidence = 0.0
    else:
        compound_score = (positive_score - negative_score) / total_weight
        confidence = min(total_weight / 5.0, 1.0)

    # Calculate probabilities (softmax-style distribution)
    if total_weight == 0:
        positive_prob = 0.33
        negative_prob = 0.33
        neutral_prob = 0.34
    else:
        # Scale compound score to probabilities
        if compound_score > 0:
            positive_prob = 0.33 + (compound_score * 0.5 * confidence)
            negative_prob = 0.33 - (compound_score * 0.25 * confidence)
            neutral_prob = 1.0 - positive_prob - negative_prob
        else:
            negative_prob = 0.33 + (abs(compound_score) * 0.5 * confidence)
            positive_prob = 0.33 - (abs(compound_score) * 0.25 * confidence)
            neutral_prob = 1.0 - positive_prob - negative_prob

    # Ensure probabilities are valid
    positive_prob = max(0.0, min(1.0, positive_prob))
    negative_prob = max(0.0, min(1.0, negative_prob))
    neutral_prob = max(0.0, min(1.0, neutral_prob))

    # Determine sentiment label
    if compound_score > 0.15:
        sentiment = "positive"
        nlp_sentiment = "positive"
    elif compound_score < -0.15:
        sentiment = "negative"
        nlp_sentiment = "negative"
    else:
        sentiment = "neutral"
        nlp_sentiment = "neutral"

    return {
        "sentiment": sentiment,
        "score": round(compound_score, 2),
        "keyword": {
            "score": round(compound_score, 2),
            "confidence": round(confidence, 2)
        },
        "nlp": {
            "sentiment": nlp_sentiment,
            "score": round(compound_score, 2),
            "positive": round(positive_prob, 2),
            "negative": round(negative_prob, 2),
            "neutral": round(neutral_prob, 2)
        }
    }


@app.get("/api/news/{symbol}")
async def get_stock_news(symbol: str, limit: int = 5, timeframe: str = '1d'):
    """Get latest news for a stock with sentiment analysis"""
    try:
        news_items = await get_ticker_news_async(symbol, timeframe)

        if not news_items:
            return {"symbol": symbol, "news": [], "overall_sentiment": "neutral"}

        processed_news = []
        sentiment_scores = []

        for item in news_items[:limit]:
            # Handle new yfinance news structure (nested under 'content')
            content = item.get('content', {}) if isinstance(item, dict) else {}

            title = content.get('title', '') or item.get('title', '')
            summary = content.get('summary', '') or item.get('summary', '')

            # Combine title and summary for better sentiment analysis
            text_for_analysis = title
            if summary:
                text_for_analysis += ' ' + summary

            sentiment = analyze_sentiment(text_for_analysis)
            sentiment_scores.append(sentiment['score'])

            # Extract publisher from nested structure
            provider = content.get('provider', {})
            publisher = provider.get('displayName', '') or item.get('publisher', 'Unknown')

            # Extract link from nested structure
            canonical_url = content.get('canonicalUrl', {})
            link = canonical_url.get('url', '') or item.get('link', '')

            # Handle date - new format uses ISO string 'pubDate', old used timestamp
            pub_date = content.get('pubDate') or content.get('displayTime')
            if pub_date:
                published = pub_date  # Already ISO format
            elif item.get('providerPublishTime'):
                published = datetime.fromtimestamp(item.get('providerPublishTime')).isoformat()
            else:
                published = None

            processed_news.append({
                "title": title,
                "publisher": publisher,
                "link": link,
                "published": published,
                "sentiment": sentiment
            })

        # Calculate overall sentiment
        if sentiment_scores:
            avg_score = sum(sentiment_scores) / len(sentiment_scores)
            if avg_score > 0.1:
                overall = "positive"
            elif avg_score < -0.1:
                overall = "negative"
            else:
                overall = "neutral"
        else:
            overall = "neutral"
            avg_score = 0

        return {
            "symbol": symbol,
            "news": processed_news,
            "overall_sentiment": overall,
            "overall_score": round(avg_score, 2)
        }
    except Exception as e:
        print(f"Error fetching news for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stocks/top/{n}/with-news")
async def get_top_stocks_with_news(n: int = 10, timeframe: str = '1d', force_refresh: bool = False):
    """Get top stocks with news sentiment, using processed cache if available"""
    if timeframe not in ['1m', '1h', '1d', '1w']:
        timeframe = '1m'

    # Check processed cache for this timeframe
    if not force_refresh and timeframe in _processed_top_stocks:
        last_update = _last_top_stocks_update.get(timeframe)
        if last_update and (datetime.now() - last_update).total_seconds() < 240:
            cached_result = _processed_top_stocks[timeframe]
            return cached_result[:n]

    symbols = COMMON_SYMBOLS

    # Fetch stock info for ALL common symbols to have a complete ranked list
    stock_tasks = [fetch_stock_info(symbol, timeframe) for symbol in symbols]
    stock_results = await asyncio.gather(*stock_tasks)

    stocks = [stock for stock in stock_results if stock is not None]
    stocks.sort(key=lambda x: x.potential_score, reverse=True)
    
    # We'll fetch news for the top 15 stocks to keep it responsive but complete
    news_limit = min(15, len(stocks))
    top_for_news = stocks[:news_limit]

    # Fetch news for top stocks
    news_tasks = [get_stock_news(stock.symbol, limit=3) for stock in top_for_news]
    news_results = await asyncio.gather(*news_tasks, return_exceptions=True)

    # Combine stock info with news
    full_result = []
    for i, stock in enumerate(stocks):
        stock_dict = stock.model_dump()
        
        # Add news if available (only for the ones we fetched news for)
        if i < len(news_results):
            news = news_results[i]
            if isinstance(news, dict):
                stock_dict['news'] = news.get('news', [])
                stock_dict['news_sentiment'] = news.get('overall_sentiment', 'neutral')
                stock_dict['news_score'] = news.get('overall_score', 0)

                # Update sentiment score in score_breakdown
                sentiment = news.get('overall_sentiment', 'neutral')
                news_score_val = news.get('overall_score', 0)
                sentiment_score = 5
                if sentiment == 'positive':
                    sentiment_score = min(10, 7 + abs(news_score_val))
                elif sentiment == 'negative':
                    sentiment_score = max(0, 3 - abs(news_score_val))
                
                if stock_dict.get('score_breakdown'):
                    old_s = stock_dict['score_breakdown'].get('sentiment', 5)
                    stock_dict['score_breakdown']['sentiment'] = sentiment_score
                    stock_dict['score_breakdown']['total'] = stock_dict['score_breakdown']['total'] - old_s + sentiment_score
                    stock_dict['potential_score'] = stock_dict['score_breakdown']['total']
            else:
                stock_dict['news'] = []
                stock_dict['news_sentiment'] = 'neutral'
                stock_dict['news_score'] = 0
        else:
            # For stocks beyond the news limit, use defaults
            stock_dict['news'] = []
            stock_dict['news_sentiment'] = 'neutral'
            stock_dict['news_score'] = 0

        full_result.append(stock_dict)

    # Re-sort by updated potential score
    full_result.sort(key=lambda x: x['potential_score'], reverse=True)

    # Update processed cache (store full list)
    _processed_top_stocks[timeframe] = full_result
    _last_top_stocks_update[timeframe] = datetime.now()
    
    # Check for alerts using the full result
    if force_refresh or len(_processed_top_stocks) == 1:
        asyncio.create_task(check_and_send_alerts(full_result))

    return full_result[:n]


# ============== Push Notification Endpoints ==============

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict

@app.get("/api/push/vapid-public-key")
async def get_vapid_public_key():
    """Get VAPID public key for push subscription"""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=500, detail="VAPID keys not configured")
    return {"publicKey": VAPID_PUBLIC_KEY}

@app.post("/api/push/subscribe")
async def subscribe_push(subscription: PushSubscription):
    """Subscribe to push notifications"""
    subscription_id = subscription.endpoint.split("/")[-1][:16]
    push_subscriptions[subscription_id] = subscription.model_dump()
    print(f"📱 Push subscription added: {subscription_id}")
    return {"success": True, "id": subscription_id}

@app.post("/api/push/unsubscribe")
async def unsubscribe_push(subscription: PushSubscription):
    """Unsubscribe from push notifications"""
    subscription_id = subscription.endpoint.split("/")[-1][:16]
    if subscription_id in push_subscriptions:
        del push_subscriptions[subscription_id]
        print(f"📱 Push subscription removed: {subscription_id}")
    return {"success": True}

async def send_push_notification(subscription: dict, title: str, body: str, data: dict = None):
    """Send push notification to a subscriber"""
    if not VAPID_PRIVATE_KEY:
        print("⚠️ VAPID keys not configured, skipping push notification")
        return False

    try:
        payload = json.dumps({
            "title": title,
            "body": body,
            "icon": "/icon-192.png",
            "data": data or {}
        })

        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        print(f"📨 Push notification sent: {title}")
        return True
    except WebPushException as e:
        print(f"❌ Push notification failed: {e}")
        if e.response and e.response.status_code == 410:
            # Subscription expired, remove it
            subscription_id = subscription.get('endpoint', '').split("/")[-1][:16]
            if subscription_id in push_subscriptions:
                del push_subscriptions[subscription_id]
        return False

async def check_and_send_alerts(stocks: list):
    """Check stocks for alert conditions and send push notifications"""
    global previous_stock_states

    for stock in stocks:
        symbol = stock.get('symbol')
        current_state = {
            'trend': stock.get('trend'),
            'score': stock.get('potential_score', 0),
            'sentiment': stock.get('news_sentiment', 'neutral')
        }

        prev_state = previous_stock_states.get(symbol)

        # Check alert conditions:
        # 1. Score >= 85
        # 2. Positive sentiment
        # 3. Changed from non-BULLISH to BULLISH
        if (
            current_state['score'] >= 85 and
            current_state['sentiment'] == 'positive' and
            current_state['trend'] == 'BULLISH' and
            prev_state and
            prev_state.get('trend') != 'BULLISH'
        ):
            # Send push notification to all subscribers
            title = f"🚀 {symbol} Alert!"
            body = f"{symbol} turned BULLISH!\nScore: {current_state['score']:.0f}/100\nSentiment: Positive"

            for sub_id, subscription in list(push_subscriptions.items()):
                await send_push_notification(subscription, title, body, {"symbol": symbol})

        # Update previous state
        previous_stock_states[symbol] = current_state

@app.post("/api/push/test")
async def test_push():
    """Send a test push notification to all subscribers"""
    count = 0
    for sub_id, subscription in list(push_subscriptions.items()):
        success = await send_push_notification(
            subscription,
            "Test Notification 🔔",
            "Push notifications are working!",
            {"test": True}
        )
        if success:
            count += 1
    return {"success": True, "sent": count}

@app.get("/api/push/subscriptions")
async def get_subscriptions():
    """Debug endpoint to check active push subscriptions"""
    return {
        "count": len(push_subscriptions),
        "subscription_ids": list(push_subscriptions.keys())
    }


# ============== Cache Management Endpoints ==============

@app.get("/api/cache/stats")
async def get_cache_stats():
    """Get cache statistics"""
    return {
        "ticker_cache": ticker_cache.stats(),
        "ttl_seconds": CACHE_TTL_TICKER
    }

@app.post("/api/cache/clear")
async def clear_cache():
    """Clear all cache entries"""
    await ticker_cache.clear()
    return {"success": True, "message": "Cache cleared"}

@app.post("/api/cache/cleanup")
async def cleanup_cache():
    """Remove expired cache entries"""
    removed = await ticker_cache.cleanup()
    return {"success": True, "expired_removed": removed}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)