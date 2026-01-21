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

app = FastAPI(title="Stock Trading Bot API")

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
if "," in raw_origins:
    origins = [origin.strip() for origin in raw_origins.split(",")]
else:
    origins = [raw_origins]

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thread pool for async yfinance operations
executor = ThreadPoolExecutor(max_workers=10)

# Semaphore to limit concurrent yfinance requests
MAX_CONCURRENT_FETCHES = 5
fetch_semaphore = asyncio.Semaphore(MAX_CONCURRENT_FETCHES)

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

# In-memory storage (use database in production)
portfolios = {}
active_bots = {}
trade_history = []

# Async wrapper for yfinance operations
async def run_async(func, *args, **kwargs):
    """Run blocking function in thread pool"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, functools.partial(func, *args, **kwargs))

async def get_ticker_info_async(symbol: str):
    """Async wrapper for yfinance Ticker info with concurrency limit"""
    async with fetch_semaphore:
        def _get_info():
            ticker = yf.Ticker(symbol)
            return ticker.info
        return await run_async(_get_info)

async def get_ticker_history_async(symbol: str, period: str = "1mo"):
    """Async wrapper for yfinance history with concurrency limit"""
    async with fetch_semaphore:
        def _get_history():
            ticker = yf.Ticker(symbol)
            return ticker.history(period=period)
        return await run_async(_get_history)

async def get_ticker_async(symbol: str):
    """Get full ticker object async with concurrency limit"""
    async with fetch_semaphore:
        def _get_ticker():
            return yf.Ticker(symbol)
        return await run_async(_get_ticker)

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
                # Update average price
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
            return trade
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
            return trade
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

# Stock Analysis
async def calculate_potential_score_async(symbol: str, timeframe: str = '1d') -> float:
    """Calculate potential score based on momentum and volatility - async version"""
    try:
        # Map timeframe to yfinance period
        period_map = {
            '1h': '1d',   # Need at least 1 day for hourly data
            '1d': '5d',   # 5 days for daily analysis
            '1w': '1mo'   # 1 month for weekly analysis
        }
        period = period_map.get(timeframe, '5d')
        
        hist = await get_ticker_history_async(symbol, period)
        if len(hist) < 5:
            return 0.0
        
        # For hourly timeframe, use more recent data
        if timeframe == '1h' and len(hist) > 7:
            hist = hist.iloc[-7:]  # Last 7 hours
        elif timeframe == '1d' and len(hist) > 5:
            hist = hist.iloc[-5:]  # Last 5 days
        
        # Momentum score (recent price trend)
        momentum = ((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]) * 100
        
        # Volatility score
        volatility = hist['Close'].std() / hist['Close'].mean()
        
        # Volume trend
        vol_trend = (hist['Volume'].iloc[-3:].mean() / hist['Volume'].mean()) - 1 if len(hist) >= 3 else 0
        
        # Composite score (normalized to 0-100)
        score = max(0, min(100, 50 + (momentum * 2) + (vol_trend * 10) - (volatility * 20)))
        return round(score, 2)
    except:
        return 0.0

async def get_trend_async(symbol: str, timeframe: str = '1d') -> str:
    """Determine price trend - async version"""
    try:
        # Map timeframe to analysis period
        period_map = {
            '1h': '1d',
            '1d': '5d',
            '1w': '1mo'
        }
        period = period_map.get(timeframe, '5d')
        
        hist = await get_ticker_history_async(symbol, period)
        if len(hist) < 2:
            return "NEUTRAL"
        
        # Adjust lookback based on timeframe
        if timeframe == '1h' and len(hist) > 6:
            hist = hist.iloc[-6:]  # Last 6 hours
        elif timeframe == '1d' and len(hist) > 5:
            hist = hist.iloc[-5:]  # Last 5 days
        
        change = ((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0]) * 100
        
        # Adjust thresholds based on timeframe
        threshold_map = {
            '1h': 0.5,   # Smaller moves in hourly
            '1d': 1.0,   # Standard for daily
            '1w': 2.0    # Larger moves weekly
        }
        threshold = threshold_map.get(timeframe, 1.0)
        
        if change > threshold:
            return "BULLISH"
        elif change < -threshold:
            return "BEARISH"
        return "NEUTRAL"
    except:
        return "NEUTRAL"

async def fetch_stock_info(symbol: str, timeframe: str = '1d') -> Optional[StockInfo]:
    """Fetch stock info for a single symbol - async"""
    try:
        info = await get_ticker_info_async(symbol)
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        
        # Get historical data for change calculation based on timeframe
        period_map = {
            '1h': '1d',
            '1d': '5d',
            '1w': '1mo'
        }
        period = period_map.get(timeframe, '5d')
        hist = await get_ticker_history_async(symbol, period)
        
        # Calculate change based on timeframe
        if not hist.empty:
            if timeframe == '1h' and len(hist) > 1:
                # Use last hour's change (approximate with recent data)
                reference_price = hist['Close'].iloc[-2] if len(hist) > 1 else hist['Close'].iloc[0]
            elif timeframe == '1d':
                reference_price = hist['Close'].iloc[0]
            elif timeframe == '1w':
                reference_price = hist['Close'].iloc[0]
            else:
                reference_price = info.get('previousClose', current_price)
            
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
        print(f"Error fetching {symbol}: {e}")
        return None

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "Stock Trading Bot API", 
        "version": "2.0 - Async Enabled",
        "max_concurrent_fetches": MAX_CONCURRENT_FETCHES
    }

@app.get("/api/stocks/top/{n}")
async def get_top_stocks(n: int = 10, timeframe: str = '1d'):
    """Fetch top N potential stocks from default watchlist with timeframe"""
    # Validate timeframe
    if timeframe not in ['1h', '1d', '1w']:
        timeframe = '1d'
    
    # Default popular stocks
    symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
               "JPM", "BAC", "WMT", "V", "MA", "DIS", "PYPL", "ADBE", "CRM", "ORCL"]
    
    # Fetch all stocks concurrently with timeframe
    tasks = [fetch_stock_info(symbol, timeframe) for symbol in symbols[:n*2]]
    results = await asyncio.gather(*tasks)
    
    # Filter out None results and sort by potential score
    stocks = [stock for stock in results if stock is not None]
    stocks.sort(key=lambda x: x.potential_score, reverse=True)
    
    return stocks[:n]

@app.post("/api/stocks/analyze")
async def analyze_custom_stocks(request: SymbolListRequest, timeframe: str = '1d'):
    """Analyze custom list of stock symbols with timeframe"""
    # Validate timeframe
    if timeframe not in ['1h', '1d', '1w']:
        timeframe = '1d'
    
    symbols = [s.upper().strip() for s in request.symbols]
    limit = request.limit or len(symbols)
    
    # Fetch all stocks concurrently with timeframe
    tasks = [fetch_stock_info(symbol, timeframe) for symbol in symbols]
    results = await asyncio.gather(*tasks)
    
    # Filter out None results and sort by potential score
    stocks = [stock for stock in results if stock is not None]
    stocks.sort(key=lambda x: x.potential_score, reverse=True)
    
    return stocks[:limit]

@app.get("/api/stocks/search/{query}")
async def search_stocks(query: str, limit: int = 10, timeframe: str = '1d'):
    """Search for stocks by symbol or name with timeframe"""
    # Validate timeframe
    if timeframe not in ['1h', '1d', '1w']:
        timeframe = '1d'
    
    # For a production app, you'd want to use a proper stock search API
    # This is a simple implementation using common symbols
    query = query.upper().strip()
    
    # Common stock symbols categorized
    all_symbols = {
        "tech": ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX", "AMD", "INTC"],
        "finance": ["JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "SCHW", "AXP", "USB"],
        "retail": ["WMT", "COST", "TGT", "HD", "LOW", "NKE", "SBUX", "MCD", "CMG", "DPZ"],
        "healthcare": ["JNJ", "UNH", "PFE", "ABBV", "TMO", "ABT", "MRK", "CVS", "LLY", "AMGN"],
        "energy": ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HAL"]
    }
    
    # Flatten all symbols
    all_stock_list = []
    for category_symbols in all_symbols.values():
        all_stock_list.extend(category_symbols)
    
    # Filter symbols that match the query
    matching_symbols = [s for s in all_stock_list if query in s]
    
    if not matching_symbols:
        return []
    
    # Fetch info for matching symbols with timeframe
    tasks = [fetch_stock_info(symbol, timeframe) for symbol in matching_symbols[:limit]]
    results = await asyncio.gather(*tasks)
    
    return [stock for stock in results if stock is not None]

@app.post("/api/bot/start")
async def start_trading_bot(config: TradingConfig):
    """Start trading bot with specified configuration"""
    bot_id = f"bot_{config.symbol}_{datetime.now().timestamp()}"
    
    # Validate symbol exists
    try:
        await get_ticker_info_async(config.symbol)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid symbol: {config.symbol}")
    
    # Initialize broker if not exists
    if bot_id not in portfolios:
        portfolios[bot_id] = SimulatedBroker(config.capital)
    
    active_bots[bot_id] = {
        "config": config,
        "active": True,
        "created_at": datetime.now()
    }
    
    return {"bot_id": bot_id, "status": "started", "config": config}

@app.post("/api/bot/stop/{bot_id}")
async def stop_trading_bot(bot_id: str):
    """Stop trading bot"""
    if bot_id in active_bots:
        active_bots[bot_id]["active"] = False
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
    
    # Get current prices for positions concurrently
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
async def get_price_history(symbol: str, period: str = "1mo"):
    """Get historical price data for a symbol"""
    try:
        hist = await get_ticker_history_async(symbol, period)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail="No data found for symbol")
        
        # Convert to list of dictionaries
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

@app.post("/api/stocks/batch-prices")
async def get_batch_prices(symbols: List[str]):
    """Get current prices for multiple symbols at once"""
    async def get_price(symbol: str):
        try:
            info = await get_ticker_info_async(symbol)
            return {
                "symbol": symbol,
                "price": info.get('currentPrice', info.get('regularMarketPrice', 0)),
                "success": True
            }
        except:
            return {"symbol": symbol, "price": 0, "success": False}
    
    tasks = [get_price(symbol.upper()) for symbol in symbols]
    results = await asyncio.gather(*tasks)
    return results

# WebSocket for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Collect all active bot symbols
            active_symbols = []
            bot_symbol_map = {}
            
            for bot_id, bot_info in active_bots.items():
                if bot_info["active"]:
                    symbol = bot_info["config"].symbol
                    active_symbols.append(symbol)
                    bot_symbol_map[symbol] = bot_id
            
            # Fetch all prices concurrently
            if active_symbols:
                tasks = [get_ticker_info_async(symbol) for symbol in active_symbols]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for symbol, result in zip(active_symbols, results):
                    if isinstance(result, dict):
                        price = result.get('currentPrice', 0)
                        bot_id = bot_symbol_map[symbol]
                        
                        await manager.broadcast({
                            "type": "price_update",
                            "bot_id": bot_id,
                            "symbol": symbol,
                            "price": price,
                            "timestamp": datetime.now().isoformat()
                        })
            
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)