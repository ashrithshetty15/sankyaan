import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { searchStock } from './services.js';
import { getTickersWithFunds, getFundHouses, getAllStocks, getPeerStocks } from './db.js';
import { fetchStockQuote, fetchHistoricalPrices, getStockData, searchStocks } from './stockDataFetcher.js';
import { calculatePortfolioForensics } from './routes/calculatePortfolioForensics.js';
import { getFundRatings, refreshFundRatings } from './routes/fundRatings.js';
import { getStockRatings, refreshStockRatings } from './routes/stockRatings.js';
import { fetchFMPDividendCalendar, fetchFMPStockSplits } from './fmpService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get all fund houses
app.get('/api/fundhouses', async (req, res) => {
  try {
    console.log('🏢 Fetching all fund houses...');
    const fundHouses = await getFundHouses();
    console.log(`✅ Found ${fundHouses.length} fund houses`);
    res.json({ fundHouses });
  } catch (error) {
    console.error('Error fetching fund houses:', error);
    res.status(500).json({ message: 'Failed to fetch fund houses', error: error.message });
  }
});

// Get all tickers with their fund names for autocomplete (optionally filtered by fund house)
app.get('/api/tickers', async (req, res) => {
  try {
    const { fundHouse } = req.query;
    console.log(`📋 Fetching tickers${fundHouse ? ` for ${fundHouse}` : ''}...`);
    const tickersWithFunds = await getTickersWithFunds(fundHouse);
    console.log(`✅ Found ${tickersWithFunds.length} fund-ticker combinations`);
    res.json({ tickersWithFunds });
  } catch (error) {
    console.error('Error fetching tickers:', error);
    res.status(500).json({ message: 'Failed to fetch tickers', error: error.message });
  }
});

// Search API
app.get('/api/search', async (req, res) => {
  try {
    const { ticker } = req.query;
    console.log(`🔍 Searching for fund: ${ticker}`);

    if (!ticker || ticker.trim() === '') {
      return res.status(400).json({ message: 'Fund name is required' });
    }

    const result = await searchStock(ticker);

    if (!result) {
      console.log(`❌ Fund not found: ${ticker}`);
      return res.status(404).json({
        message: `Fund "${ticker}" not found in portfolio.`
      });
    }

    console.log(`✅ Found fund with ${result.funds.length} holdings`);
    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Stock API endpoints

// Get all stocks
app.get('/api/stocks', async (req, res) => {
  try {
    console.log('📈 Fetching all stocks...');
    const stocks = await getAllStocks();
    console.log(`✅ Found ${stocks.length} stocks`);
    res.json({ stocks });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ message: 'Failed to fetch stocks', error: error.message });
  }
});

// Fetch and update stock data
app.post('/api/stocks/fetch/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`📊 Fetching stock data for: ${symbol}`);

    const stockData = await fetchStockQuote(symbol);
    res.json({ success: true, data: stockData });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({ message: 'Failed to fetch stock data', error: error.message });
  }
});

// Get stock details
app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`📈 Getting stock data for: ${symbol}`);

    let stockData = await getStockData(symbol);

    // If not in database, fetch from API
    if (!stockData) {
      console.log(`Stock ${symbol} not in database, fetching...`);
      await fetchStockQuote(symbol);
      stockData = await getStockData(symbol);
    }

    if (!stockData) {
      return res.status(404).json({ message: `Stock ${symbol} not found` });
    }

    res.json(stockData);
  } catch (error) {
    console.error('Error getting stock:', error);
    res.status(500).json({ message: 'Failed to get stock data', error: error.message });
  }
});

// Search stocks
app.get('/api/stocks/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    console.log(`🔍 Searching stocks: ${query}`);

    const results = await searchStocks(query);
    res.json({ results });
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ message: 'Failed to search stocks', error: error.message });
  }
});

// Fetch historical prices
app.post('/api/stocks/:symbol/historical', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period1, period2 } = req.body;

    console.log(`📈 Fetching historical data for: ${symbol}`);

    const count = await fetchHistoricalPrices(symbol, period1, period2);
    res.json({ success: true, recordsInserted: count });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ message: 'Failed to fetch historical data', error: error.message });
  }
});

// Portfolio forensics - calculate aggregate quality scores for mutual fund
app.get('/api/portfolio-forensics/:ticker', calculatePortfolioForensics);

// Fund ratings - serve from DB (fast) and refresh (slow, on-demand)
app.get('/api/fund-ratings', getFundRatings);
app.post('/api/fund-ratings/refresh', refreshFundRatings);

// Stock ratings - serve from cache (fast) and refresh (on-demand)
app.get('/api/stock-ratings', getStockRatings);
app.post('/api/stock-ratings/refresh', refreshStockRatings);

// Peer groups - get industry peers for a stock
app.get('/api/peer-groups/:stockId', async (req, res) => {
  try {
    const { stockId } = req.params;
    console.log(`🔍 Fetching peer stocks for stock ID: ${stockId}`);

    const result = await getPeerStocks(stockId);
    console.log(`   Industry: ${result.industry}, Sector: ${result.sector}`);
    console.log(`✅ Found ${result.peers.length} peer stocks`);

    res.json(result);
  } catch (error) {
    console.error('Error fetching peer groups:', error);
    res.status(500).json({ message: 'Failed to fetch peer groups', error: error.message });
  }
});

// Corporate events - get dividends, splits, etc. from FMP
app.get('/api/stocks/:symbol/events', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`📅 Fetching corporate events for: ${symbol}`);

    // Fetch dividends and splits in parallel
    const [dividendsResult, splitsResult] = await Promise.all([
      fetchFMPDividendCalendar(symbol),
      fetchFMPStockSplits(symbol)
    ]);

    const events = [];

    // Process dividends
    if (dividendsResult.success && dividendsResult.data && dividendsResult.data.length > 0) {
      dividendsResult.data.forEach(div => {
        events.push({
          date: div.date,
          type: 'dividend',
          amount: div.dividend,
          description: div.label || 'Cash Dividend'
        });
      });
    }

    // Process stock splits
    if (splitsResult.success && splitsResult.data && splitsResult.data.length > 0) {
      splitsResult.data.forEach(split => {
        events.push({
          date: split.date,
          type: 'split',
          ratio: `${split.numerator}:${split.denominator}`,
          description: `Stock Split ${split.numerator}:${split.denominator}`
        });
      });
    }

    // Sort by date (most recent first)
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log(`✅ Found ${events.length} corporate events for ${symbol}`);
    res.json({ events });
  } catch (error) {
    console.error('Error fetching corporate events:', error);
    res.status(500).json({ message: 'Failed to fetch corporate events', error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Try: http://localhost:${PORT}/api/search?ticker=INFY`);
});
