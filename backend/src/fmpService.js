import axios from 'axios';
import db from './db.js';

// FMP API Configuration
const FMP_API_KEY = process.env.FMP_API_KEY || 'YOUR_FMP_API_KEY';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * Rate limiter for FMP API calls
 * Free tier: 250 requests/day
 * Premium: Higher limits
 */
class RateLimiter {
  constructor(requestsPerSecond = 5) {
    this.delay = 1000 / requestsPerSecond;
    this.lastRequestTime = 0;
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.delay) {
      const waitTime = this.delay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new RateLimiter(5); // 5 requests per second

/**
 * Fetch stock quote from FMP
 */
export async function fetchFMPQuote(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/quote/${symbol}`, {
      params: { apikey: FMP_API_KEY }
    });

    if (response.data && response.data.length > 0) {
      const quote = response.data[0];

      // Store in database
      const result = await db.query(
        `INSERT INTO stocks (
          symbol, company_name, exchange, sector, industry,
          market_cap, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (symbol) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          market_cap = EXCLUDED.market_cap,
          updated_at = NOW()
        RETURNING id`,
        [
          symbol,
          quote.name,
          quote.exchange || 'NSE',
          quote.sector || null,
          quote.industry || null,
          quote.marketCap || 0
        ]
      );

      const stockId = result.rows[0].id;

      // Store current price in stock_prices table
      await db.query(
        `INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
        ON CONFLICT (stock_id, date) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume`,
        [
          stockId,
          quote.open || quote.price,
          quote.dayHigh || quote.price,
          quote.dayLow || quote.price,
          quote.price,
          quote.volume || 0
        ]
      );

      console.log(`✅ Stored quote for ${symbol}`);
      return { success: true, stockId, quote };
    }

    return { success: false, error: 'No data returned' };
  } catch (error) {
    console.error(`❌ Error fetching FMP quote for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch historical prices from FMP
 */
export async function fetchFMPHistoricalPrices(symbol, from, to) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/historical-price-full/${symbol}`, {
      params: {
        apikey: FMP_API_KEY,
        from: from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: to || new Date().toISOString().split('T')[0]
      }
    });

    if (response.data && response.data.historical) {
      const prices = response.data.historical;

      // Get stock ID
      const stockResult = await db.query('SELECT id FROM stocks WHERE symbol = $1', [symbol]);

      if (stockResult.rows.length === 0) {
        console.log(`⚠️  Stock ${symbol} not found in database. Fetch quote first.`);
        return { success: false, error: 'Stock not found' };
      }

      const stockId = stockResult.rows[0].id;

      // Batch insert prices
      for (const price of prices) {
        await db.query(
          `INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (stock_id, date) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume`,
          [
            stockId,
            price.date,
            price.open,
            price.high,
            price.low,
            price.close,
            price.volume
          ]
        );
      }

      console.log(`✅ Stored ${prices.length} historical prices for ${symbol}`);
      return { success: true, count: prices.length };
    }

    return { success: false, error: 'No historical data returned' };
  } catch (error) {
    console.error(`❌ Error fetching FMP historical prices for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch company profile and fundamentals from FMP
 */
export async function fetchFMPProfile(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/profile/${symbol}`, {
      params: { apikey: FMP_API_KEY }
    });

    if (response.data && response.data.length > 0) {
      const profile = response.data[0];

      // Get or create stock
      let stockResult = await db.query('SELECT id FROM stocks WHERE symbol = $1', [symbol]);
      let stockId;

      if (stockResult.rows.length === 0) {
        // Create stock entry
        const insertResult = await db.query(
          `INSERT INTO stocks (symbol, company_name, exchange, sector, industry, isin, market_cap)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [
            symbol,
            profile.companyName,
            profile.exchangeShortName || 'NSE',
            profile.sector,
            profile.industry,
            profile.isin,
            profile.mktCap
          ]
        );
        stockId = insertResult.rows[0].id;
      } else {
        stockId = stockResult.rows[0].id;

        // Update existing stock
        await db.query(
          `UPDATE stocks SET
            company_name = $1,
            sector = $2,
            industry = $3,
            isin = $4,
            market_cap = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [
            profile.companyName,
            profile.sector,
            profile.industry,
            profile.isin,
            profile.mktCap,
            stockId
          ]
        );
      }

      // Store fundamentals
      await storeFundamentals(stockId, symbol, profile);

      console.log(`✅ Stored profile for ${symbol}`);
      return { success: true, stockId, profile };
    }

    return { success: false, error: 'No profile data returned' };
  } catch (error) {
    console.error(`❌ Error fetching FMP profile for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch income statement from FMP
 */
export async function fetchFMPIncomeStatement(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/income-statement/${symbol}`, {
      params: {
        apikey: FMP_API_KEY,
        limit: 1 // Get most recent
      }
    });

    if (response.data && response.data.length > 0) {
      return { success: true, data: response.data[0] };
    }

    return { success: false, error: 'No income statement data' };
  } catch (error) {
    console.error(`❌ Error fetching income statement for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch balance sheet from FMP
 */
export async function fetchFMPBalanceSheet(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/balance-sheet-statement/${symbol}`, {
      params: {
        apikey: FMP_API_KEY,
        limit: 1
      }
    });

    if (response.data && response.data.length > 0) {
      return { success: true, data: response.data[0] };
    }

    return { success: false, error: 'No balance sheet data' };
  } catch (error) {
    console.error(`❌ Error fetching balance sheet for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch cash flow statement from FMP
 */
export async function fetchFMPCashFlow(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/cash-flow-statement/${symbol}`, {
      params: {
        apikey: FMP_API_KEY,
        limit: 1
      }
    });

    if (response.data && response.data.length > 0) {
      return { success: true, data: response.data[0] };
    }

    return { success: false, error: 'No cash flow data' };
  } catch (error) {
    console.error(`❌ Error fetching cash flow for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch key metrics and ratios from FMP
 */
export async function fetchFMPKeyMetrics(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/key-metrics/${symbol}`, {
      params: {
        apikey: FMP_API_KEY,
        limit: 1
      }
    });

    if (response.data && response.data.length > 0) {
      return { success: true, data: response.data[0] };
    }

    return { success: false, error: 'No key metrics data' };
  } catch (error) {
    console.error(`❌ Error fetching key metrics for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch dividend calendar (corporate events)
 */
export async function fetchFMPDividendCalendar(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/historical-price-full/stock_dividend/${symbol}`, {
      params: { apikey: FMP_API_KEY }
    });

    if (response.data && response.data.historical) {
      return { success: true, data: response.data.historical };
    }

    return { success: false, error: 'No dividend data' };
  } catch (error) {
    console.error(`❌ Error fetching dividends for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch stock splits
 */
export async function fetchFMPStockSplits(symbol) {
  try {
    await rateLimiter.throttle();

    const response = await axios.get(`${FMP_BASE_URL}/historical-price-full/stock_split/${symbol}`, {
      params: { apikey: FMP_API_KEY }
    });

    if (response.data && response.data.historical) {
      return { success: true, data: response.data.historical };
    }

    return { success: false, error: 'No split data' };
  } catch (error) {
    console.error(`❌ Error fetching splits for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Store fundamentals in database
 */
async function storeFundamentals(stockId, symbol, profile) {
  try {
    // Fetch additional fundamental data
    const [incomeStmt, balanceSheet, cashFlow, keyMetrics] = await Promise.all([
      fetchFMPIncomeStatement(symbol),
      fetchFMPBalanceSheet(symbol),
      fetchFMPCashFlow(symbol),
      fetchFMPKeyMetrics(symbol)
    ]);

    const income = incomeStmt.success ? incomeStmt.data : {};
    const balance = balanceSheet.success ? balanceSheet.data : {};
    const cash = cashFlow.success ? cashFlow.data : {};
    const metrics = keyMetrics.success ? keyMetrics.data : {};

    // Insert/update fundamentals
    await db.query(
      `INSERT INTO stock_fundamentals (
        stock_id, revenue, net_income, ebitda, eps, pe_ratio, pb_ratio,
        roe, roa, debt_to_equity, current_ratio, quick_ratio,
        operating_margin, net_margin, gross_margin,
        total_assets, total_debt, total_stockholders_equity,
        operating_cash_flow, free_cash_flow, dividend_yield,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
      ON CONFLICT (stock_id) DO UPDATE SET
        revenue = EXCLUDED.revenue,
        net_income = EXCLUDED.net_income,
        ebitda = EXCLUDED.ebitda,
        eps = EXCLUDED.eps,
        pe_ratio = EXCLUDED.pe_ratio,
        pb_ratio = EXCLUDED.pb_ratio,
        roe = EXCLUDED.roe,
        roa = EXCLUDED.roa,
        debt_to_equity = EXCLUDED.debt_to_equity,
        current_ratio = EXCLUDED.current_ratio,
        quick_ratio = EXCLUDED.quick_ratio,
        operating_margin = EXCLUDED.operating_margin,
        net_margin = EXCLUDED.net_margin,
        gross_margin = EXCLUDED.gross_margin,
        total_assets = EXCLUDED.total_assets,
        total_debt = EXCLUDED.total_debt,
        total_stockholders_equity = EXCLUDED.total_stockholders_equity,
        operating_cash_flow = EXCLUDED.operating_cash_flow,
        free_cash_flow = EXCLUDED.free_cash_flow,
        dividend_yield = EXCLUDED.dividend_yield,
        updated_at = NOW()`,
      [
        stockId,
        income.revenue || null,
        income.netIncome || null,
        income.ebitda || null,
        income.eps || null,
        metrics.peRatio || profile.beta || null,
        metrics.pbRatio || null,
        metrics.roe || null,
        metrics.roa || null,
        balance.totalDebt && balance.totalStockholdersEquity
          ? balance.totalDebt / balance.totalStockholdersEquity
          : null,
        balance.totalCurrentAssets && balance.totalCurrentLiabilities
          ? balance.totalCurrentAssets / balance.totalCurrentLiabilities
          : null,
        balance.cashAndCashEquivalents && balance.totalCurrentLiabilities
          ? (balance.cashAndCashEquivalents + (balance.shortTermInvestments || 0)) / balance.totalCurrentLiabilities
          : null,
        income.operatingIncomeRatio ? income.operatingIncomeRatio * 100 : null,
        income.netIncomeRatio ? income.netIncomeRatio * 100 : null,
        income.grossProfitRatio ? income.grossProfitRatio * 100 : null,
        balance.totalAssets || null,
        balance.totalDebt || null,
        balance.totalStockholdersEquity || null,
        cash.operatingCashFlow || null,
        cash.freeCashFlow || null,
        profile.lastDiv || null
      ]
    );

    console.log(`✅ Stored fundamentals for ${symbol}`);
  } catch (error) {
    console.error(`❌ Error storing fundamentals for ${symbol}:`, error.message);
  }
}

/**
 * Fetch complete stock data from FMP and store in database
 */
export async function fetchAndStoreCompleteStockData(symbol) {
  console.log(`\n📊 Fetching complete data for ${symbol} from FMP...\n`);

  try {
    // 1. Fetch and store profile (includes fundamentals)
    const profileResult = await fetchFMPProfile(symbol);
    if (!profileResult.success) {
      console.log(`❌ Failed to fetch profile for ${symbol}`);
      return { success: false, error: profileResult.error };
    }

    const stockId = profileResult.stockId;

    // 2. Fetch and store quote (current price)
    await fetchFMPQuote(symbol);

    // 3. Fetch and store historical prices (1 year)
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    await fetchFMPHistoricalPrices(symbol, oneYearAgo, today);

    // 4. Fetch and store dividend history
    const dividends = await fetchFMPDividendCalendar(symbol);

    // 5. Fetch and store splits
    const splits = await fetchFMPStockSplits(symbol);

    console.log(`\n✅ Complete data stored for ${symbol}`);
    return {
      success: true,
      stockId,
      hasDividends: dividends.success && dividends.data.length > 0,
      hasSplits: splits.success && splits.data.length > 0
    };

  } catch (error) {
    console.error(`❌ Error fetching complete data for ${symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}
