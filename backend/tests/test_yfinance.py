import yfinance as yf
ticker = yf.Ticker('GOLD')
print({
    'info': ticker.info,
    'history': ticker.history(period='7d', interval='1h'),
    'news': ticker.news
})