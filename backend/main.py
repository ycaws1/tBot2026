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

# VADER sentiment analysis (from nltk, lightweight)
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

# Initialize VADER (lazy loading)
vader_analyzer = None

def get_vader():
    """Lazy load VADER sentiment analyzer"""
    global vader_analyzer
    if vader_analyzer is None:
        print("=" * 50)
        print("Loading VADER sentiment analyzer...")
        print("This should only happen ONCE per server start.")
        print("=" * 50)
        try:
            nltk.data.find('sentiment/vader_lexicon.zip')
        except LookupError:
            print("Downloading VADER lexicon...")
            nltk.download('vader_lexicon', quiet=True)
        vader_analyzer = SentimentIntensityAnalyzer()
        print("VADER loaded and cached!")
    return vader_analyzer

# Import strategies
from strategies import StrategyFactory

app = FastAPI(title="Stock Trading Bot API")

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
    price: float
    change: float
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

async def get_ticker_info_async(symbol: str):
    async with fetch_semaphore:
        def _get_info():
            ticker = yf.Ticker(symbol)
            return ticker.info
        return await run_async(_get_info)

async def get_ticker_history_async(symbol: str, period: str = "1mo", interval: str = "1d"):
    async with fetch_semaphore:
        def _get_history():
            ticker = yf.Ticker(symbol)
            return ticker.history(period=period, interval=interval)
        return await run_async(_get_history)

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
                # Fetch current price
                info = await get_ticker_info_async(symbol)
                current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
                
                if current_price == 0:
                    print(f"⚠️ Could not get valid price for {symbol}")
                    await asyncio.sleep(check_interval)
                    continue
                
                # Fetch historical data for strategy
                hist = await get_ticker_history_async(symbol, period="1mo")
                
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
        period_map = {'1m': '7d', '1h': '5d', '1d': '1mo', '1w': '3mo'}
        interval_map = {'1m': '1m', '1h': '1h', '1d': '1d', '1w': '1d'}
        period = period_map.get(timeframe, '1mo')
        interval = interval_map.get(timeframe, '1d')

        hist = await get_ticker_history_async(symbol, period, interval)
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
        period_map = {'1m': '7d', '1h': '5d', '1d': '1mo', '1w': '3mo'}
        interval_map = {'1m': '1m', '1h': '1h', '1d': '1d', '1w': '1d'}
        period = period_map.get(timeframe, '1mo')
        interval = interval_map.get(timeframe, '1d')

        hist = await get_ticker_history_async(symbol, period, interval)
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
        info = await get_ticker_info_async(symbol)
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))

        period_map = {'1m': '7d', '1h': '5d', '1d': '1mo', '1w': '3mo'}
        interval_map = {'1m': '1m', '1h': '1h', '1d': '1d', '1w': '1d'}
        period = period_map.get(timeframe, '7d')
        interval = interval_map.get(timeframe, '1d')
        hist = await get_ticker_history_async(symbol, period, interval)

        if not hist.empty:
            if timeframe == '1h' and len(hist) > 1:
                reference_price = hist['Close'].iloc[-2] if len(hist) > 1 else hist['Close'].iloc[0]
            else:
                reference_price = hist['Close'].iloc[0]

            change = ((current_price - reference_price) / reference_price * 100) if reference_price else 0
        else:
            prev_close = info.get('previousClose', current_price)
            change = ((current_price - prev_close) / prev_close * 100) if prev_close else 0

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
            price=current_price,
            change=change,
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

@app.get("/api/stocks/top/{n}")
async def get_top_stocks(n: int = 10, timeframe: str = '1d'):
    if timeframe not in ['1m', '1h', '1d', '1w']:
        timeframe = '1m'
    
    symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
               "JPM", "BAC", "WMT", "V", "MA", "DIS", "PYPL", "ADBE", "CRM", "ORCL"]
    
    tasks = [fetch_stock_info(symbol, timeframe) for symbol in symbols[:n*2]]
    results = await asyncio.gather(*tasks)
    
    stocks = [stock for stock in results if stock is not None]
    stocks.sort(key=lambda x: x.potential_score, reverse=True)
    
    return stocks[:n]

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

@app.post("/api/bot/start")
async def start_trading_bot(config: TradingConfig):
    """Start trading bot with specified configuration"""
    bot_id = f"bot_{config.symbol}_{uuid.uuid4().hex[:8]}"
    
    # Validate symbol
    try:
        await get_ticker_info_async(config.symbol)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid symbol: {config.symbol}")
    
    # Initialize broker
    portfolios[bot_id] = SimulatedBroker(config.capital)
    
    # Store bot info
    active_bots[bot_id] = {
        "config": config,
        "active": True,
        "created_at": datetime.now()
    }
    
    # Start the trading task
    task = asyncio.create_task(trading_bot_task(bot_id))
    bot_tasks[bot_id] = task
    
    print(f"✨ Started new trading bot: {bot_id} for {config.symbol}")
    
    return {"bot_id": bot_id, "status": "started", "config": config}

@app.post("/api/bot/stop/{bot_id}")
async def stop_trading_bot(bot_id: str):
    """Stop trading bot"""
    if bot_id in active_bots:
        active_bots[bot_id]["active"] = False
        
        # Cancel the task
        if bot_id in bot_tasks:
            bot_tasks[bot_id].cancel()
            try:
                await bot_tasks[bot_id]
            except asyncio.CancelledError:
                pass
            del bot_tasks[bot_id]
        
        # Remove from active_bots to prevent it from appearing in active list
        del active_bots[bot_id]
        
        print(f"🛑 Stopped trading bot: {bot_id}")
        return {"bot_id": bot_id, "status": "stopped"}
    raise HTTPException(status_code=404, detail="Bot not found")

@app.get("/api/bots/active")
async def get_active_bots():
    """Get list of all active bots"""
    bots_list = []
    for bot_id, bot_info in active_bots.items():
        bots_list.append({
            "bot_id": bot_id,
            "symbol": bot_info["config"].symbol,
            "strategy": bot_info["config"].strategy,
            "active": bot_info["active"],
            "created_at": bot_info["created_at"].isoformat(),
            "config": {
                "symbol": bot_info["config"].symbol,
                "strategy": bot_info["config"].strategy,
                "capital": bot_info["config"].capital,
                "entry_threshold": bot_info["config"].entry_threshold,
                "exit_threshold": bot_info["config"].exit_threshold,
                "stop_loss": bot_info["config"].stop_loss
            }
        })
    return bots_list

@app.get("/api/portfolio/{bot_id}")
async def get_portfolio(bot_id: str):
    """Get portfolio information"""
    if bot_id not in portfolios:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    broker = portfolios[bot_id]
    
    # Get current prices
    current_prices = {}
    if broker.positions:
        symbols = list(broker.positions.keys())
        tasks = [get_ticker_info_async(symbol) for symbol in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for symbol, result in zip(symbols, results):
            if isinstance(result, dict):
                current_prices[symbol] = result.get('currentPrice', 0)
            else:
                current_prices[symbol] = 0
    
    equity = broker.get_portfolio_value(current_prices)
    profit_loss = broker.get_profit_loss(current_prices)
    
    return Portfolio(
        cash=broker.cash,
        equity=equity,
        positions=broker.positions,
        trades=broker.trades,
        profit_loss=profit_loss
    )

@app.get("/api/price/{symbol}")
async def get_stock_price(symbol: str):
    """Get current stock price"""
    try:
        info = await get_ticker_info_async(symbol)
        price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        return {"symbol": symbol, "price": price, "timestamp": datetime.now()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history/{symbol}")
async def get_price_history(symbol: str, period: str = "1mo", interval: str = "1d"):
    """Get historical price data"""
    try:
        hist = await get_ticker_history_async(symbol, period, interval)

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
    """Combined keyword-based and FinBERT NLP sentiment analysis"""
    text_lower = text.lower()

    # --- Keyword-based analysis ---
    positive_words = [
        'surge', 'soar', 'jump', 'gain', 'rise', 'climb', 'rally', 'boost',
        'bullish', 'upbeat', 'optimistic', 'growth', 'profit', 'beat', 'exceed',
        'strong', 'positive', 'upgrade', 'buy', 'outperform', 'record', 'high',
        'success', 'breakthrough', 'innovation', 'expansion', 'recovery'
    ]

    negative_words = [
        'drop', 'fall', 'decline', 'plunge', 'crash', 'sink', 'tumble', 'slide',
        'bearish', 'pessimistic', 'loss', 'miss', 'disappoint', 'weak', 'negative',
        'downgrade', 'sell', 'underperform', 'low', 'fail', 'cut', 'layoff',
        'concern', 'risk', 'warning', 'lawsuit', 'investigation', 'recall'
    ]

    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)

    total = positive_count + negative_count
    if total == 0:
        keyword_score = 0.0
        keyword_confidence = 0.0
    else:
        keyword_score = (positive_count - negative_count) / total
        keyword_confidence = min(total / 5, 1.0)

    # --- VADER NLP analysis ---
    nlp_compound = 0.0
    nlp_sentiment = "neutral"
    positive_prob = 0.33
    negative_prob = 0.33
    neutral_prob = 0.34

    try:
        analyzer = get_vader()
        scores = analyzer.polarity_scores(text)

        positive_prob = scores['pos']
        negative_prob = scores['neg']
        neutral_prob = scores['neu']
        nlp_compound = scores['compound']  # VADER compound score (-1 to +1)

        # Classify based on compound score
        if nlp_compound >= 0.05:
            nlp_sentiment = "positive"
        elif nlp_compound <= -0.05:
            nlp_sentiment = "negative"
        else:
            nlp_sentiment = "neutral"
    except Exception as e:
        print(f"VADER error: {e}")

    # --- Combined score (30% keyword, 70% VADER) ---
    combined_score = (0.3 * keyword_score) + (0.7 * nlp_compound)

    if combined_score > 0.1:
        sentiment = "positive"
    elif combined_score < -0.1:
        sentiment = "negative"
    else:
        sentiment = "neutral"

    return {
        "sentiment": sentiment,
        "score": round(combined_score, 2),
        "keyword": {
            "score": round(keyword_score, 2),
            "confidence": round(keyword_confidence, 2)
        },
        "nlp": {
            "sentiment": nlp_sentiment,
            "score": round(nlp_compound, 2),
            "positive": round(positive_prob, 2),
            "negative": round(negative_prob, 2),
            "neutral": round(neutral_prob, 2)
        }
    }


async def get_ticker_news_async(symbol: str):
    """Fetch news for a stock using yfinance"""
    async with fetch_semaphore:
        def _get_news():
            ticker = yf.Ticker(symbol)
            return ticker.news
        return await run_async(_get_news)


@app.get("/api/news/{symbol}")
async def get_stock_news(symbol: str, limit: int = 5):
    """Get latest news for a stock with sentiment analysis"""
    try:
        news_items = await get_ticker_news_async(symbol)

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
async def get_top_stocks_with_news(n: int = 10, timeframe: str = '1d'):
    """Get top stocks with news sentiment"""
    if timeframe not in ['1m', '1h', '1d', '1w']:
        timeframe = '1m'

    symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
               "JPM", "BAC", "WMT", "V", "MA", "DIS", "PYPL", "ADBE", "CRM", "ORCL"]

    # Fetch stock info
    stock_tasks = [fetch_stock_info(symbol, timeframe) for symbol in symbols[:n*2]]
    stock_results = await asyncio.gather(*stock_tasks)

    stocks = [stock for stock in stock_results if stock is not None]
    stocks.sort(key=lambda x: x.potential_score, reverse=True)
    top_stocks = stocks[:n]

    # Fetch news for top stocks
    news_tasks = [get_stock_news(stock.symbol, limit=3) for stock in top_stocks]
    news_results = await asyncio.gather(*news_tasks, return_exceptions=True)

    # Combine stock info with news
    result = []
    for stock, news in zip(top_stocks, news_results):
        stock_dict = stock.dict()
        if isinstance(news, dict):
            stock_dict['news'] = news.get('news', [])
            stock_dict['news_sentiment'] = news.get('overall_sentiment', 'neutral')
            stock_dict['news_score'] = news.get('overall_score', 0)

            # Update sentiment score in score_breakdown based on actual news
            sentiment = news.get('overall_sentiment', 'neutral')
            news_score_value = news.get('overall_score', 0)

            # Calculate sentiment score (max 10 points)
            if sentiment == 'positive':
                sentiment_score = min(10, 7 + abs(news_score_value))
            elif sentiment == 'negative':
                sentiment_score = max(0, 3 - abs(news_score_value))
            else:
                sentiment_score = 5

            # Update score breakdown
            if stock_dict.get('score_breakdown'):
                old_sentiment = stock_dict['score_breakdown'].get('sentiment', 5)
                stock_dict['score_breakdown']['sentiment'] = sentiment_score
                stock_dict['score_breakdown']['total'] = stock_dict['score_breakdown']['total'] - old_sentiment + sentiment_score
                stock_dict['potential_score'] = stock_dict['score_breakdown']['total']
        else:
            stock_dict['news'] = []
            stock_dict['news_sentiment'] = 'neutral'
            stock_dict['news_score'] = 0
        result.append(stock_dict)

    # Re-sort by updated potential score
    result.sort(key=lambda x: x['potential_score'], reverse=True)

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)