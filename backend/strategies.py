from abc import ABC, abstractmethod
from typing import Optional, Dict
import pandas as pd
import numpy as np

class TradingStrategy(ABC):
    """Base class for all trading strategies"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.symbol = config['symbol']
        self.capital = config['capital']
        self.entry_threshold = config.get('entry_threshold', 0.02)
        self.exit_threshold = config.get('exit_threshold', 0.03)
        self.stop_loss = config.get('stop_loss', -0.05)
        self.position = None
        self.entry_price = None
    
    @abstractmethod
    def should_buy(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        """Determine if we should buy"""
        pass
    
    @abstractmethod
    def should_sell(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        """Determine if we should sell"""
        pass
    
    def calculate_quantity(self, price: float) -> int:
        """Calculate how many shares to buy"""
        max_shares = int(self.capital / price)
        return max(1, max_shares)
    
    def check_stop_loss(self, current_price: float) -> bool:
        """Check if stop loss is triggered"""
        if self.entry_price and self.position:
            pct_change = (current_price - self.entry_price) / self.entry_price
            return pct_change <= self.stop_loss
        return False


class MomentumStrategy(TradingStrategy):
    """
    Momentum Strategy: Buy when price shows strong upward momentum,
    sell when momentum weakens or reverses
    """
    
    def should_buy(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if self.position:
            return False
        
        if len(historical_data) < 10:
            return False
        
        # Calculate short-term and long-term moving averages
        sma_short = historical_data['Close'].tail(5).mean()
        sma_long = historical_data['Close'].tail(10).mean()
        
        # Buy signal: short MA crosses above long MA and price is above short MA
        momentum = (sma_short - sma_long) / sma_long
        price_above_sma = current_price > sma_short
        
        return momentum > self.entry_threshold and price_above_sma
    
    def should_sell(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if not self.position:
            return False
        
        # Check stop loss first
        if self.check_stop_loss(current_price):
            return True
        
        if len(historical_data) < 10:
            return False
        
        # Calculate momentum
        sma_short = historical_data['Close'].tail(5).mean()
        sma_long = historical_data['Close'].tail(10).mean()
        
        # Sell signal: momentum weakens or price drops below short MA
        momentum = (sma_short - sma_long) / sma_long
        price_below_sma = current_price < sma_short
        
        # Also check profit target
        if self.entry_price:
            profit_pct = (current_price - self.entry_price) / self.entry_price
            if profit_pct >= self.exit_threshold:
                return True
        
        return momentum < 0 or price_below_sma


class GridTradingStrategy(TradingStrategy):
    """
    Grid Trading Strategy: Place buy/sell orders at predetermined price levels
    """
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.grid_levels = config.get('grid_levels', 5)
        self.grid_spacing = config.get('grid_spacing', 0.01)  # 1% spacing
        self.base_price = None
        self.grid_prices = []
    
    def initialize_grid(self, base_price: float):
        """Initialize grid levels around base price"""
        self.base_price = base_price
        self.grid_prices = []
        
        for i in range(-self.grid_levels, self.grid_levels + 1):
            level_price = base_price * (1 + i * self.grid_spacing)
            self.grid_prices.append(level_price)
    
    def should_buy(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if self.position:
            return False
        
        # Initialize grid if not set
        if not self.grid_prices:
            self.initialize_grid(current_price)
        
        # Buy at grid levels below base price
        buy_levels = [p for p in self.grid_prices if p < self.base_price]
        
        for buy_price in buy_levels:
            if abs(current_price - buy_price) / buy_price < 0.001:  # Within 0.1%
                return True
        
        return False
    
    def should_sell(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if not self.position:
            return False
        
        # Check stop loss
        if self.check_stop_loss(current_price):
            return True
        
        # Sell at grid levels above entry price
        if self.entry_price:
            profit_pct = (current_price - self.entry_price) / self.entry_price
            
            # Sell if reached a grid level above entry
            sell_levels = [p for p in self.grid_prices if p > self.entry_price]
            for sell_price in sell_levels:
                if abs(current_price - sell_price) / sell_price < 0.001:
                    return True
        
        return False


class MeanReversionStrategy(TradingStrategy):
    """
    Mean Reversion Strategy: Buy when price is below average,
    sell when it returns to or above average
    """
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.lookback_period = config.get('lookback_period', 20)
        self.std_dev_threshold = config.get('std_dev_threshold', 2.0)
    
    def should_buy(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if self.position:
            return False
        
        if len(historical_data) < self.lookback_period:
            return False
        
        # Calculate Bollinger Bands
        sma = historical_data['Close'].tail(self.lookback_period).mean()
        std = historical_data['Close'].tail(self.lookback_period).std()
        lower_band = sma - (self.std_dev_threshold * std)
        
        # Buy when price touches or goes below lower Bollinger Band
        return current_price <= lower_band
    
    def should_sell(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if not self.position:
            return False
        
        # Check stop loss
        if self.check_stop_loss(current_price):
            return True
        
        if len(historical_data) < self.lookback_period:
            return False
        
        # Calculate mean
        sma = historical_data['Close'].tail(self.lookback_period).mean()
        std = historical_data['Close'].tail(self.lookback_period).std()
        upper_band = sma + (self.std_dev_threshold * std)
        
        # Sell when price returns to mean or reaches upper band
        if current_price >= sma:
            return True
        
        # Also check profit target
        if self.entry_price:
            profit_pct = (current_price - self.entry_price) / self.entry_price
            if profit_pct >= self.exit_threshold:
                return True
        
        return False


class BreakoutStrategy(TradingStrategy):
    """
    Breakout Strategy: Buy when price breaks above resistance,
    sell when it breaks below support
    """
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.lookback_period = config.get('lookback_period', 20)
    
    def should_buy(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if self.position:
            return False
        
        if len(historical_data) < self.lookback_period:
            return False
        
        # Calculate resistance (recent high)
        resistance = historical_data['High'].tail(self.lookback_period).max()
        
        # Buy when price breaks above resistance
        return current_price > resistance * (1 + self.entry_threshold)
    
    def should_sell(self, current_price: float, historical_data: pd.DataFrame) -> bool:
        if not self.position:
            return False
        
        # Check stop loss
        if self.check_stop_loss(current_price):
            return True
        
        if len(historical_data) < self.lookback_period:
            return False
        
        # Calculate support (recent low)
        support = historical_data['Low'].tail(self.lookback_period).min()
        
        # Sell when price breaks below support or reaches profit target
        if self.entry_price:
            profit_pct = (current_price - self.entry_price) / self.entry_price
            if profit_pct >= self.exit_threshold:
                return True
        
        return current_price < support * (1 - self.entry_threshold)


class StrategyFactory:
    """Factory to create strategy instances"""
    
    strategies = {
        'momentum': MomentumStrategy,
        'grid': GridTradingStrategy,
        'mean_reversion': MeanReversionStrategy,
        'breakout': BreakoutStrategy
    }
    
    @classmethod
    def create_strategy(cls, strategy_type: str, config: Dict) -> TradingStrategy:
        """Create a strategy instance"""
        strategy_class = cls.strategies.get(strategy_type.lower())
        if not strategy_class:
            raise ValueError(f"Unknown strategy type: {strategy_type}")
        return strategy_class(config)
    
    @classmethod
    def list_strategies(cls) -> list:
        """List available strategies"""
        return list(cls.strategies.keys())