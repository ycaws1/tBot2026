import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import sys
sys.path.append('..')
from strategies import (
    MomentumStrategy,
    GridTradingStrategy,
    MeanReversionStrategy,
    BreakoutStrategy,
    StrategyFactory
)

@pytest.fixture
def sample_config():
    return {
        'symbol': 'AAPL',
        'capital': 10000,
        'entry_threshold': 0.02,
        'exit_threshold': 0.03,
        'stop_loss': -0.05
    }

@pytest.fixture
def uptrend_data():
    """Generate sample data for uptrend"""
    dates = pd.date_range(end=datetime.now(), periods=20, freq='D')
    prices = np.linspace(100, 120, 20)  # Upward trend
    return pd.DataFrame({
        'Close': prices,
        'High': prices + 2,
        'Low': prices - 2,
        'Volume': [1000000] * 20
    }, index=dates)

@pytest.fixture
def downtrend_data():
    """Generate sample data for downtrend"""
    dates = pd.date_range(end=datetime.now(), periods=20, freq='D')
    prices = np.linspace(120, 100, 20)  # Downward trend
    return pd.DataFrame({
        'Close': prices,
        'High': prices + 2,
        'Low': prices - 2,
        'Volume': [1000000] * 20
    }, index=dates)

@pytest.fixture
def sideways_data():
    """Generate sample data for sideways movement"""
    dates = pd.date_range(end=datetime.now(), periods=20, freq='D')
    prices = [110 + np.random.uniform(-2, 2) for _ in range(20)]
    return pd.DataFrame({
        'Close': prices,
        'High': [p + 2 for p in prices],
        'Low': [p - 2 for p in prices],
        'Volume': [1000000] * 20
    }, index=dates)


class TestMomentumStrategy:
    def test_initialization(self, sample_config):
        strategy = MomentumStrategy(sample_config)
        assert strategy.symbol == 'AAPL'
        assert strategy.capital == 10000
        assert strategy.position is None
    
    def test_should_buy_uptrend(self, sample_config, uptrend_data):
        strategy = MomentumStrategy(sample_config)
        current_price = 121
        should_buy = strategy.should_buy(current_price, uptrend_data)
        assert isinstance(should_buy, bool)
    
    def test_should_sell_with_profit(self, sample_config, uptrend_data):
        strategy = MomentumStrategy(sample_config)
        strategy.position = True
        strategy.entry_price = 100
        current_price = 105  # 5% profit
        should_sell = strategy.should_sell(current_price, uptrend_data)
        assert should_sell  # Should sell at profit target
    
    def test_stop_loss_trigger(self, sample_config, downtrend_data):
        strategy = MomentumStrategy(sample_config)
        strategy.position = True
        strategy.entry_price = 120
        current_price = 113  # -5.8% loss
        should_sell = strategy.should_sell(current_price, downtrend_data)
        assert should_sell  # Should sell at stop loss
    
    def test_calculate_quantity(self, sample_config):
        strategy = MomentumStrategy(sample_config)
        price = 100
        quantity = strategy.calculate_quantity(price)
        assert quantity == 100  # $10000 / $100 = 100 shares


class TestGridTradingStrategy:
    def test_initialization(self, sample_config):
        config = {**sample_config, 'grid_levels': 5, 'grid_spacing': 0.01}
        strategy = GridTradingStrategy(config)
        assert strategy.grid_levels == 5
        assert strategy.grid_spacing == 0.01
    
    def test_grid_initialization(self, sample_config):
        config = {**sample_config, 'grid_levels': 3, 'grid_spacing': 0.01}
        strategy = GridTradingStrategy(config)
        strategy.initialize_grid(100)
        
        assert len(strategy.grid_prices) == 7  # -3 to +3 levels
        assert strategy.base_price == 100
        assert min(strategy.grid_prices) < 100
        assert max(strategy.grid_prices) > 100


class TestMeanReversionStrategy:
    def test_initialization(self, sample_config):
        config = {**sample_config, 'lookback_period': 20}
        strategy = MeanReversionStrategy(config)
        assert strategy.lookback_period == 20
    
    def test_buy_at_lower_band(self, sample_config, sideways_data):
        strategy = MeanReversionStrategy(sample_config)
        mean = sideways_data['Close'].mean()
        std = sideways_data['Close'].std()
        current_price = mean - 2.5 * std  # Below lower band
        
        should_buy = strategy.should_buy(current_price, sideways_data)
        # Should consider buying at lower band
        assert isinstance(should_buy, bool)


class TestBreakoutStrategy:
    def test_initialization(self, sample_config):
        config = {**sample_config, 'lookback_period': 20}
        strategy = BreakoutStrategy(config)
        assert strategy.lookback_period == 20
    
    def test_breakout_detection(self, sample_config, uptrend_data):
        strategy = BreakoutStrategy(sample_config)
        resistance = uptrend_data['High'].max()
        current_price = resistance * 1.03  # 3% above resistance
        
        should_buy = strategy.should_buy(current_price, uptrend_data)
        assert should_buy  # Should buy on breakout


class TestStrategyFactory:
    def test_create_momentum_strategy(self, sample_config):
        strategy = StrategyFactory.create_strategy('momentum', sample_config)
        assert isinstance(strategy, MomentumStrategy)
    
    def test_create_grid_strategy(self, sample_config):
        strategy = StrategyFactory.create_strategy('grid', sample_config)
        assert isinstance(strategy, GridTradingStrategy)
    
    def test_create_mean_reversion_strategy(self, sample_config):
        strategy = StrategyFactory.create_strategy('mean_reversion', sample_config)
        assert isinstance(strategy, MeanReversionStrategy)
    
    def test_create_breakout_strategy(self, sample_config):
        strategy = StrategyFactory.create_strategy('breakout', sample_config)
        assert isinstance(strategy, BreakoutStrategy)
    
    def test_invalid_strategy(self, sample_config):
        with pytest.raises(ValueError):
            StrategyFactory.create_strategy('invalid_strategy', sample_config)
    
    def test_list_strategies(self):
        strategies = StrategyFactory.list_strategies()
        assert 'momentum' in strategies
        assert 'grid' in strategies
        assert 'mean_reversion' in strategies
        assert 'breakout' in strategies
        assert len(strategies) == 4


# Integration tests
class TestStrategyIntegration:
    def test_full_trading_cycle(self, sample_config, uptrend_data):
        """Test a complete buy-sell cycle"""
        strategy = MomentumStrategy(sample_config)
        
        # Initially should not have position
        assert strategy.position is None
        
        # Should buy on uptrend
        current_price = 121
        if strategy.should_buy(current_price, uptrend_data):
            strategy.position = True
            strategy.entry_price = current_price
        
        # Should sell at profit target
        profit_price = current_price * 1.04  # 4% profit
        should_sell = strategy.should_sell(profit_price, uptrend_data)
        
        if should_sell:
            profit = (profit_price - strategy.entry_price) / strategy.entry_price
            assert profit > 0  # Verify profitable trade


if __name__ == '__main__':
    pytest.main([__file__, '-v'])