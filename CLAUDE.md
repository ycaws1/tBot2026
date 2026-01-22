# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock Trading Bot - a full-stack web application for simulated algorithmic trading. Uses virtual funds with real stock market data from Yahoo Finance. Not for real money trading.

## Commands

### Backend (FastAPI)

```bash
cd backend
source .venv/bin/activate
uv run uvicorn main:app --reload   # Dev server on port 8000
pytest tests/test_strategies.py -v  # Run tests
```

### Frontend (Next.js)

```bash
cd frontend
npm run dev      # Dev server on port 3000
npm run build    # Production build
npm run lint     # ESLint
```

## Architecture

```
Frontend (Next.js/React)          Backend (FastAPI)
├── Dashboard (/)                 ├── main.py (API routes, bot tasks)
├── Trading (/trading)            └── strategies.py (4 trading strategies)
└── Portfolio (/portfolio)
         │
         └── REST API (localhost:8000) ──→ yfinance (Yahoo Finance)
```

**Data Flow**: Stock Discovery → Bot Configuration → Automated Trading → Portfolio Tracking

### Key Backend Components

- `main.py`: FastAPI app with routes `/api/stocks/*`, `/api/bot/*`, `/api/portfolio/*`
- `strategies.py`: Base `TradingStrategy` class + 4 implementations (momentum, grid, mean_reversion, breakout)
- `SimulatedBroker`: In-memory broker tracking cash, positions, and trades

### Key Frontend Components

- `lib/api-config.ts`: Centralized API endpoint management (env var → localStorage → default)
- `components/SettingsModal.tsx`: Runtime API URL configuration

### State Management

- **Backend**: In-memory dicts (`portfolios`, `active_bots`, `bot_tasks`) - lost on restart
- **Frontend**: sessionStorage for active bots, localStorage for API URL

## Trading Strategies

All strategies in `strategies.py` inherit from `TradingStrategy`:

| Strategy | Logic |
|----------|-------|
| momentum | Buys on upward momentum (short MA > long MA) |
| grid | Buy/sell at predetermined price levels around base price |
| mean_reversion | Buys below lower Bollinger Band, sells at SMA |
| breakout | Buys above 20-period high, sells below 20-period low |

**Adding a new strategy**: Create class inheriting `TradingStrategy`, implement `should_buy()`/`should_sell()`, register in `StrategyFactory.strategies` dict, add tests, add UI option in `frontend/app/trading/page.tsx`.

## Concurrency Patterns

- Thread pool executor for blocking yfinance calls (max 10 workers)
- Semaphore limits concurrent API requests (max 5)
- Bots poll every 10 seconds (`check_interval` in `trading_bot_task()`)

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `CORS_ORIGINS` | Backend | Comma-separated allowed origins (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend API URL (default: `http://localhost:8000`) |

## API Quick Reference

```bash
curl http://localhost:8000/api/stocks/top/5           # Top stocks
curl http://localhost:8000/api/bots/active            # Active bots
curl http://localhost:8000/api/portfolio/{bot_id}     # Portfolio
curl http://localhost:8000/api/price/{symbol}         # Current price
```
