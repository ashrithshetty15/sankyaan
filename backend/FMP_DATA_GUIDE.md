# FMP Data Population Guide

This guide explains how to use Financial Modeling Prep (FMP) API to populate your database with stock data.

## 🔑 Prerequisites

### 1. Get FMP API Key

1. Sign up at [Financial Modeling Prep](https://financialmodelingprep.com/developer/docs/)
2. Get your API key from the dashboard
3. Free tier provides 250 requests/day

### 2. Set Environment Variable

Add your FMP API key to `.env` file:

```env
FMP_API_KEY=your_api_key_here
```

Or set it temporarily for testing:

**Windows (Command Prompt):**
```cmd
set FMP_API_KEY=your_api_key_here
```

**Windows (PowerShell):**
```powershell
$env:FMP_API_KEY="your_api_key_here"
```

**Linux/Mac:**
```bash
export FMP_API_KEY=your_api_key_here
```

## 📊 Available Scripts

### 1. Check Current Status

See how much FMP data is already populated:

```bash
node check_fmp_status.js
```

**Output:**
- Total NSE symbols
- Stocks with FMP data
- Missing data count
- Top 10 stocks by market cap
- Data quality metrics
- Storage size

### 2. Populate Sample Data (Testing)

Test FMP integration with a small sample:

```bash
# Fetch 10 random stocks (default)
node populate_fmp_sample.js

# Fetch 50 random stocks
node populate_fmp_sample.js 50

# Fetch specific symbols
node populate_fmp_sample.js TCS INFY RELIANCE HDFCBANK
```

**Use this for:**
- Testing your FMP API key
- Quick data updates
- Specific stock updates

### 3. Populate All NSE Stocks

Fetch complete FMP data for all 2,099 NSE stocks:

```bash
node populate_fmp_data.js
```

**Features:**
- Processes in batches of 50 stocks
- 10-second delay between batches
- Skips stocks with recent data (< 7 days old)
- Rate limiting (5 requests/second)
- Comprehensive progress tracking
- Error logging

**Duration:**
- ~8-12 hours for all 2,099 stocks
- Free tier: 250 requests/day (will take ~9 days)
- Premium tier: Much faster

**What it fetches for each stock:**
1. Company profile & fundamentals
2. Current stock quote
3. Historical prices (1 year)
4. Dividend history
5. Stock splits

## 📈 Data Stored

### Tables Populated

1. **`stocks`** - Basic stock information
   - Symbol, company name, sector, industry
   - Market cap, exchange, ISIN
   - Created/updated timestamps

2. **`stock_prices`** - Historical price data
   - Date, open, high, low, close, volume
   - One record per trading day

3. **`stock_fundamentals`** - Financial metrics
   - Revenue, net income, EBITDA, EPS
   - P/E ratio, P/B ratio, ROE, ROA
   - Debt ratios, margins, cash flow
   - Dividend yield

## 🚀 Recommended Workflow

### First Time Setup

1. **Check current status:**
   ```bash
   node check_fmp_status.js
   ```

2. **Test with sample:**
   ```bash
   node populate_fmp_sample.js 5
   ```

3. **Verify data:**
   - Check frontend: `http://localhost:3001/stock/TCS.NS`
   - Verify price chart loads
   - Check fundamentals display

4. **Start full population:**
   ```bash
   node populate_fmp_data.js
   ```

### Regular Updates

Run weekly to keep data fresh:

```bash
# Option 1: Update all stocks (skips recent data)
node populate_fmp_data.js

# Option 2: Update top 100 stocks only
node populate_fmp_sample.js 100
```

### Troubleshooting

1. **API Key Error:**
   ```
   Error: FMP_API_KEY not set
   ```
   - Set environment variable (see Prerequisites)

2. **Rate Limit Error:**
   ```
   Error: API rate limit exceeded
   ```
   - Free tier: Wait 24 hours
   - Premium tier: Contact FMP support

3. **No Data for Symbol:**
   ```
   Error: No data returned
   ```
   - FMP may not have data for that symbol
   - Try alternate symbol format (e.g., TCS vs TCS.NS)

## 📝 Notes

### Symbol Format

FMP uses different symbol formats:
- US stocks: `AAPL`
- NSE stocks: May need `.NS` suffix (e.g., `TCS.NS`)
- BSE stocks: May need `.BO` suffix (e.g., `TCS.BO`)

The scripts try the symbol as-is first. If it fails, you may need to update the symbol in `nse_symbol_map`.

### Data Refresh Strategy

- **Daily:** Top 50 stocks by volume
- **Weekly:** Top 500 stocks by market cap
- **Monthly:** All 2,099 NSE stocks

### Performance

Rate limiting in place:
- **5 requests/second** (FMP best practice)
- **50 stocks per batch** with 10s delay
- Prevents API throttling
- Allows graceful interruption

### Cost Estimates

**Free Tier:**
- 250 requests/day
- ~25 stocks per day (10 API calls per stock)
- Full population: ~9 days

**Starter Plan ($14/month):**
- 300 requests/minute
- Full population: ~2-3 hours

**Professional Plan ($79/month):**
- 750 requests/minute
- Full population: ~1 hour

## 🔄 Integration with Frontend

Once FMP data is populated:

1. **Stock Detail Page** uses database data (no real-time API calls)
2. **Stock Chart** loads historical prices from `stock_prices` table
3. **Fundamentals** displayed from `stock_fundamentals` table
4. **Much faster page loads** (no external API delays)
5. **Works offline** (no FMP dependency for viewing)

## 🎯 Next Steps

1. Set up FMP API key
2. Run `check_fmp_status.js` to see current state
3. Test with `populate_fmp_sample.js` (5-10 stocks)
4. Run full population with `populate_fmp_data.js`
5. Set up weekly cron job for updates

---

**Questions?** Check the [FMP Documentation](https://financialmodelingprep.com/developer/docs/) or review the source code in `src/fmpService.js`.
