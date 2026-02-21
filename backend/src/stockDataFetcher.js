import YahooFinance from 'yahoo-finance2';
import db from './db.js';

const yahooFinance = new YahooFinance();

/**
 * Fetch and store stock quote data
 */
export async function fetchStockQuote(symbol) {
  try {
    console.log(`📊 Fetching quote for ${symbol}...`);

    // Fetch quote from Yahoo Finance
    const quote = await yahooFinance.quote(symbol);

    if (!quote) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    // Fetch sector/industry from quoteSummary (quote API doesn't provide these)
    let sector = null;
    let industry = null;
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['assetProfile']
      });
      sector = summary.assetProfile?.sector || null;
      industry = summary.assetProfile?.industry || null;
    } catch (err) {
      // quoteSummary might fail for some stocks, continue without sector/industry
      console.log(`  ⚠️  Could not fetch sector/industry for ${symbol}`);
    }

    // Check if stock exists, if not create it
    let stockResult = await db.query(
      'SELECT id FROM stocks WHERE symbol = $1',
      [symbol]
    );

    let stockId;
    if (stockResult.rows.length === 0) {
      // Create new stock entry
      const insertResult = await db.query(`
        INSERT INTO stocks (symbol, company_name, exchange, sector, industry, market_cap)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (symbol) DO UPDATE
        SET company_name = $2, exchange = $3, sector = $4, industry = $5, market_cap = $6, updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [
        symbol,
        quote.shortName || quote.longName || symbol,
        quote.exchange || 'NSE',
        sector,
        industry,
        quote.marketCap || null
      ]);
      stockId = insertResult.rows[0].id;
    } else {
      stockId = stockResult.rows[0].id;
      // Update existing stock (now includes sector/industry)
      await db.query(`
        UPDATE stocks
        SET company_name = $2, market_cap = $3, sector = $4, industry = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [stockId, quote.shortName || quote.longName || symbol, quote.marketCap || null, sector, industry]);
    }

    // Store current price data
    if (quote.regularMarketPrice) {
      await db.query(`
        INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
        ON CONFLICT (stock_id, date) DO UPDATE
        SET open = $2, high = $3, low = $4, close = $5, volume = $6
      `, [
        stockId,
        quote.regularMarketOpen || quote.regularMarketPrice,
        quote.regularMarketDayHigh || quote.regularMarketPrice,
        quote.regularMarketDayLow || quote.regularMarketPrice,
        quote.regularMarketPrice,
        quote.regularMarketVolume || 0
      ]);
    }

    console.log(`✅ Updated data for ${symbol}`);
    return {
      stockId,
      symbol,
      companyName: quote.shortName || quote.longName,
      currentPrice: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      marketCap: quote.marketCap,
      pe: quote.trailingPE,
      eps: quote.epsTrailingTwelveMonths,
      volume: quote.regularMarketVolume,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      sector: sector,
      industry: industry
    };
  } catch (error) {
    console.error(`Error fetching stock data for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Fetch historical price data
 */
export async function fetchHistoricalPrices(symbol, period1, period2) {
  try {
    console.log(`📈 Fetching historical data for ${symbol}...`);

    const historical = await yahooFinance.historical(symbol, {
      period1,
      period2,
      interval: '1d'
    });

    // Get stock ID
    const stockResult = await db.query(
      'SELECT id FROM stocks WHERE symbol = $1',
      [symbol]
    );

    if (stockResult.rows.length === 0) {
      throw new Error(`Stock ${symbol} not found in database`);
    }

    const stockId = stockResult.rows[0].id;

    // Insert historical prices
    for (const data of historical) {
      await db.query(`
        INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume, adjusted_close)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (stock_id, date) DO UPDATE
        SET open = $3, high = $4, low = $5, close = $6, volume = $7, adjusted_close = $8
      `, [
        stockId,
        data.date,
        data.open,
        data.high,
        data.low,
        data.close,
        data.volume,
        data.adjClose || data.close
      ]);
    }

    console.log(`✅ Stored ${historical.length} historical records for ${symbol}`);
    return historical.length;
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Get stock data from database (works with both old schema and FMP data)
 */
export async function getStockData(symbol) {
  try {
    // Get stock basic info from stocks table
    const stockResult = await db.query(`
      SELECT s.*
      FROM stocks s
      WHERE s.symbol = $1
    `, [symbol]);

    if (stockResult.rows.length === 0) {
      return null;
    }

    const stock = stockResult.rows[0];

    // Get FMP fundamentals from the view
    const fundamentalsResult = await db.query(`
      SELECT *
      FROM stock_fundamentals
      WHERE fmp_symbol = $1
      LIMIT 1
    `, [symbol]);

    // Get price history from stock_prices (if exists)
    // Fetch up to 2000 records (covers ~5-7 years of trading days)
    let priceHistoryResult = { rows: [] };
    try {
      priceHistoryResult = await db.query(`
        SELECT date, open, high, low, close, volume
        FROM stock_prices
        WHERE stock_id = $1
        ORDER BY date DESC
        LIMIT 2000
      `, [stock.id]);
    } catch (err) {
      // stock_prices table might not exist or use different schema
    }

    // Get shareholding pattern (if exists)
    let shareholdingResult = { rows: [] };
    try {
      shareholdingResult = await db.query(`
        SELECT *
        FROM shareholding_pattern
        WHERE stock_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [stock.id]);
    } catch (err) {
      // shareholding_pattern table might not exist
    }

    // Get quality scores
    const qualityResult = await db.query(`
      SELECT *
      FROM stock_quality_scores
      WHERE stock_id = $1
      ORDER BY calculated_date DESC
      LIMIT 1
    `, [stock.id]);

    const fundamentals = fundamentalsResult.rows[0] || null;

    // Transform FMP fundamentals to expected format
    const transformedFundamentals = fundamentals ? {
      revenue: fundamentals.revenue,
      net_income: fundamentals.net_income,
      ebitda: fundamentals.ebitda,
      total_assets: fundamentals.total_assets,
      total_debt: fundamentals.total_debt,
      total_stockholders_equity: fundamentals.total_stockholders_equity,
      roe: fundamentals.roe_pct || fundamentals.roe_fmp,
      roce: fundamentals.roce_pct || fundamentals.roce_fmp,
      pe_ratio: fundamentals.pe_ratio,
      pb_ratio: fundamentals.pb_ratio,
      debt_to_equity: fundamentals.debt_to_equity,
      current_ratio: fundamentals.current_ratio,
      operating_margin: fundamentals.operating_margin,
      net_margin: fundamentals.net_margin,
      ebitda_margin: fundamentals.ebitda_margin,
      free_cash_flow: fundamentals.free_cash_flow,
      operating_cash_flow: fundamentals.operating_cash_flow,
      fcf_yield_pct: fundamentals.fcf_yield_pct,
      dividend_yield: fundamentals.dividend_yield
    } : null;

    return {
      ...stock,
      current_price: fundamentals?.current_price || stock.current_price,
      market_cap: fundamentals?.market_cap_cr ? fundamentals.market_cap_cr * 10000000 : stock.market_cap,
      fundamentals: transformedFundamentals,
      priceHistory: priceHistoryResult.rows,
      shareholding: shareholdingResult.rows[0] || null,
      qualityScores: qualityResult.rows[0] || null
    };
  } catch (error) {
    console.error(`Error getting stock data for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Search stocks by name or symbol
 */
export async function searchStocks(query) {
  try {
    const result = await db.query(`
      SELECT symbol, company_name, sector, industry, market_cap
      FROM stocks
      WHERE symbol ILIKE $1 OR company_name ILIKE $1
      ORDER BY market_cap DESC NULLS LAST
      LIMIT 20
    `, [`%${query}%`]);

    return result.rows;
  } catch (error) {
    console.error('Error searching stocks:', error);
    throw error;
  }
}
