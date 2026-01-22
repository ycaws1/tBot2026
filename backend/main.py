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

# NLP sentiment analysis
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

# Download VADER lexicon (only needed once)
try:
    nltk.data.find('sentiment/vader_lexicon.zip')
except LookupError:
    nltk.download('vader_lexicon', quiet=True)

# Initialize VADER
vader_analyzer = SentimentIntensityAnalyzer()

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
class StockInfo(BaseModel):
    symbol: str
    price: float
    change: float
    volume: int
    potential_score: float
    trend: str

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
async def calculate_potential_score_async(symbol: str, timeframe: str = '1d') -> float:
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
        
        # Run score and trend calculations concurrently
        score, trend = await asyncio.gather(
            calculate_potential_score_async(symbol, timeframe),
            get_trend_async(symbol, timeframe)
        )
        
        return StockInfo(
            symbol=symbol,
            price=current_price,
            change=change,
            volume=info.get('volume', 0),
            potential_score=score,
            trend=trend
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
    """Combined keyword-based and VADER NLP sentiment analysis"""
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
    vader_scores = vader_analyzer.polarity_scores(text)
    # compound score ranges from -1 (most negative) to +1 (most positive)
    vader_compound = vader_scores['compound']

    # Classify VADER sentiment
    if vader_compound >= 0.05:
        vader_sentiment = "positive"
    elif vader_compound <= -0.05:
        vader_sentiment = "negative"
    else:
        vader_sentiment = "neutral"

    # --- Combined score (weighted average: 40% keyword, 60% VADER) ---
    # VADER is more reliable so we weight it higher
    combined_score = (0.4 * keyword_score) + (0.6 * vader_compound)

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
            "sentiment": vader_sentiment,
            "score": round(vader_compound, 2),
            "positive": round(vader_scores['pos'], 2),
            "negative": round(vader_scores['neg'], 2),
            "neutral": round(vader_scores['neu'], 2)
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
        else:
            stock_dict['news'] = []
            stock_dict['news_sentiment'] = 'neutral'
            stock_dict['news_score'] = 0
        result.append(stock_dict)

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)