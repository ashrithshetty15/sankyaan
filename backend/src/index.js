import express from 'express';
import { generateSync } from 'otplib';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { searchStock } from './services.js';
import { getTickersWithFunds, getFundHouses, getAllStocks, getPeerStocks } from './db.js';
import { fetchStockQuote, fetchHistoricalPrices, getStockData, searchStocks } from './stockDataFetcher.js';
import { calculatePortfolioForensics } from './routes/calculatePortfolioForensics.js';
import { getFundChanges } from './routes/fundChanges.js';
import { getFundRatings, refreshFundRatings } from './routes/fundRatings.js';
import { getStockRatings, refreshStockRatings } from './routes/stockRatings.js';
import { compareFunds } from './routes/fundComparison.js';
import { getFundManagers } from './routes/fundManagers.js';
import { fundScreener, getScreenerSectors } from './routes/fundScreener.js';
import { fetchFMPDividendCalendar, fetchFMPStockSplits } from './fmpService.js';
import { runMigrations } from './migrate.js';
import pool from './db.js';
import { optionalAuth } from './middleware/auth.js';
import { googleLogin, getMe, logout } from './routes/auth.js';
import { getBulkTrades, refreshBulkTrades } from './routes/bulkTrades.js';
import { subscribe, confirm, unsubscribe, sendNewsletter, getStats } from './routes/newsletter.js';
import { getMarketSentiment } from './routes/marketSentiment.js';
import { getPortfolio as getPaperPortfolio, enterTrade, closeTrade, getHistory as getPaperHistory, getStats as getPaperStats, getLeaderboard, getOptionChainForTrading } from './routes/paperTrading.js';
import { addHolding, getPortfolio, deleteHolding, getPortfolioAnalysis } from './routes/portfolio.js';
import { getTradeAlerts, getTradeAlertHistory, triggerScan, getOptionsChainEndpoint } from './routes/tradeAlerts.js';
import { initFyers, getAuthUrl, handleAuthCallback, isReady as isFyersReady, autoAuthenticate, getSpanMargin } from './fyersService.js';
import { startAutoScanner } from './autoScanner.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration for production and development
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // Alternative dev port
  'https://sankyaan.com', // Production domain
  'https://www.sankyaan.com', // Production www subdomain
  'https://sankyaan.vercel.app', // Vercel preview deployments
  'https://*.vercel.app', // All Vercel preview deployments
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      origin.match(/\.vercel\.app$/) ||
      origin.match(/^http:\/\/localhost:\d+$/)
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(optionalAuth);

// Auth routes
app.post('/api/auth/google', googleLogin);
app.get('/api/auth/me', getMe);
app.post('/api/auth/logout', logout);

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
app.get('/api/fund-changes/:fundName', getFundChanges);

// Fund ratings - serve from DB (fast) and refresh (slow, on-demand)
app.get('/api/fund-ratings', getFundRatings);
app.post('/api/fund-ratings/refresh', refreshFundRatings);

// Fund comparison - compare 2-3 funds side-by-side
app.get('/api/fund-comparison', compareFunds);

// Fund manager analytics - aggregated manager performance
app.get('/api/fund-managers', getFundManagers);

// Fund screener - advanced filtering by sector, stock, AUM, etc.
app.get('/api/fund-screener/sectors', getScreenerSectors);
app.get('/api/fund-screener', fundScreener);

// Bulk trades - mutual fund bulk/block deals
app.get('/api/bulk-trades', getBulkTrades);
app.post('/api/bulk-trades/refresh', refreshBulkTrades);

// Portfolio tracker - user's mutual fund holdings
app.post('/api/portfolio', addHolding);
app.get('/api/portfolio', getPortfolio);
app.delete('/api/portfolio/:id', deleteHolding);
app.get('/api/portfolio/analysis', getPortfolioAnalysis);

// Stock ratings - serve from cache (fast) and refresh (on-demand)
app.get('/api/stock-ratings', getStockRatings);
app.post('/api/stock-ratings/refresh', refreshStockRatings);

// Trade alerts - high probability options strategies
app.get('/api/trade-alerts', getTradeAlerts);
app.get('/api/trade-alerts/history', getTradeAlertHistory);
app.post('/api/trade-alerts/scan', triggerScan);
app.get('/api/trade-alerts/options-chain/:symbol', getOptionsChainEndpoint);

// SPAN margin for a specific trade alert (lazy-loaded on card expand)
app.get('/api/trade-alerts/:id/span-margin', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT legs, underlying FROM trade_alerts WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });

    const { legs, underlying } = result.rows[0];
    const LOT_SIZES = { NIFTY: 75, BANKNIFTY: 15 };
    const lotSize = LOT_SIZES[underlying] || 50;

    const margin = await getSpanMargin(Array.isArray(legs) ? legs : [], lotSize);
    res.json({ margin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fyers auth routes
app.get('/api/fyers/auth', (req, res) => {
  const url = getAuthUrl();
  if (!url) return res.status(500).json({ error: 'Fyers not configured' });
  // If browser request, redirect directly to Fyers login
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) return res.redirect(url);
  res.json({ authUrl: url });
});

app.get('/api/fyers/callback', async (req, res) => {
  try {
    const authCode = req.query.auth_code;
    if (!authCode) return res.status(400).json({ error: 'Missing auth_code' });
    await handleAuthCallback(authCode);
    res.send('<html><body><h2>Fyers authenticated!</h2><p>You can close this window.</p></body></html>');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fyers/status', (req, res) => {
  res.json({ connected: isFyersReady() });
});

app.get('/api/fyers/totp-check', (req, res) => {
  const secret = process.env.FYERS_TOTP_SECRET;
  if (!secret) return res.status(500).json({ error: 'FYERS_TOTP_SECRET not set' });
  const totp = generateSync({ secret });
  const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  res.json({ totp, secondsRemaining, message: 'Compare this code with your Fyers entry in your authenticator app' });
});

// Refresh all caches in correct order (stocks first, then funds)
app.post('/api/refresh-all', async (req, res) => {
  try {
    console.log('🔄 Refreshing all caches (stock → fund)...');
    const start = Date.now();

    // Step 1: Refresh stock ratings (computes CAGR from price history)
    console.log('  Step 1/2: Refreshing stock ratings cache...');
    const stockRes = { json: (d) => d, status: () => ({ json: (d) => d }) };
    await refreshStockRatings({ query: {} }, stockRes);

    // Step 2: Refresh fund ratings (reads CAGR from stock cache)
    console.log('  Step 2/2: Refreshing fund ratings...');
    const fundRes = { json: (d) => d, status: () => ({ json: (d) => d }) };
    await refreshFundRatings({ query: {} }, fundRes);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ All caches refreshed in ${elapsed}s`);

    res.json({
      success: true,
      elapsed: `${elapsed}s`,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error refreshing all caches:', error);
    res.status(500).json({ error: 'Failed to refresh caches' });
  }
});

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


// Newsletter
app.post('/api/newsletter/subscribe', subscribe);
app.get('/api/newsletter/confirm/:token', confirm);
app.get('/api/newsletter/unsubscribe/:token', unsubscribe);
app.post('/api/newsletter/send', sendNewsletter);
app.get('/api/newsletter/stats', getStats);

// Market Sentiment - live VIX, PCR, StockTwits, news
app.get('/api/market-sentiment', getMarketSentiment);

// Paper Trading
app.get('/api/paper-trading/portfolio', optionalAuth, getPaperPortfolio);
app.post('/api/paper-trading/trade', optionalAuth, enterTrade);
app.put('/api/paper-trading/trade/:id/close', optionalAuth, closeTrade);
app.get('/api/paper-trading/history', optionalAuth, getPaperHistory);
app.get('/api/paper-trading/stats', optionalAuth, getPaperStats);
app.get('/api/paper-trading/leaderboard', getLeaderboard);
app.get('/api/paper-trading/option-chain/:underlying', getOptionChainForTrading);

// Blog view counter
app.post('/api/blog/views/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug || slug.length > 255) return res.status(400).json({ error: 'Invalid slug' });
    const result = await pool.query(
      `INSERT INTO blog_views (slug, view_count, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (slug) DO UPDATE SET view_count = blog_views.view_count + 1, updated_at = NOW()
       RETURNING view_count`,
      [slug]
    );
    res.json({ views: result.rows[0].view_count });
  } catch (err) {
    console.error('Blog view error:', err.message);
    res.json({ views: 0 });
  }
});

app.get('/api/blog/views', async (req, res) => {
  try {
    const result = await pool.query('SELECT slug, view_count FROM blog_views');
    const views = {};
    for (const row of result.rows) views[row.slug] = row.view_count;
    res.json({ views });
  } catch (err) {
    console.error('Blog views fetch error:', err.message);
    res.json({ views: {} });
  }
});

// Start server with auto-migration
async function startServer() {
  console.log('🚀 Starting Sankyaan server...');

  // Run pending migrations before accepting requests
  console.log('📦 Checking database migrations...');
  await runMigrations();

  // Initialize Fyers API (loads saved token from DB if available)
  let fyersReady = await initFyers();
  if (fyersReady) {
    console.log("Trade alerts engine ready (Fyers)");
  } else {
    console.log("Fyers: no saved token, attempting auto-auth...");
    fyersReady = await autoAuthenticate();
    if (fyersReady) {
      console.log("Trade alerts engine ready (Fyers auto-auth)");
    } else {
      console.log("Fyers: auto-auth failed. Visit /api/fyers/auth or check credentials.");
    }
  }

  // Always start auto-scanner (it will self-auth when needed)
  startAutoScanner();







  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Try: http://localhost:${PORT}/api/search?ticker=INFY`);
    console.log(`🔄 Refresh all caches: POST http://localhost:${PORT}/api/refresh-all`);
    console.log(`🎯 Trade alerts: GET http://localhost:${PORT}/api/trade-alerts`);
  });
}

startServer().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
