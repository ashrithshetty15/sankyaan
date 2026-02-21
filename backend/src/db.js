import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// PostgreSQL connection pool
// Support both DATABASE_URL (Railway default) and individual vars (local dev)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'Sankyaan',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'Sankyaan',
      port: process.env.DB_PORT || 5432,
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Get a single portfolio holding by ticker
 */
export const getPortfolioByTicker = async (ticker) => {
  try {
    const query = 'SELECT * FROM hdfc_portfolio WHERE ticker = $1 LIMIT 1';
    const result = await pool.query(query, [ticker.toUpperCase()]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching portfolio by ticker:', error);
    throw error;
  }
};

/**
 * Get all funds holding a specific ticker
 */
export const getFundsHoldingTicker = async (ticker) => {
  try {
    const query = `
      SELECT * FROM hdfc_portfolio 
      WHERE ticker = $1
      ORDER BY fund_name ASC
    `;
    const result = await pool.query(query, [ticker.toUpperCase()]);
    return result.rows || [];
  } catch (error) {
    console.error('Error fetching funds holding ticker:', error);
    throw error;
  }
};

/**
 * Get all unique funds with their details
 */
export const getAllTickers = async () => {
  try {
    const query = 'SELECT DISTINCT fund_name FROM hdfc_portfolio ORDER BY fund_name ASC';
    const result = await pool.query(query);
    return result.rows.map(row => row.fund_name) || [];
  } catch (error) {
    console.error('Error fetching funds:', error);
    throw error;
  }
};

/**
 * Get all funds in the portfolio
 */
export const getAllFunds = async () => {
  try {
    const query = 'SELECT DISTINCT fund_name FROM hdfc_portfolio ORDER BY fund_name ASC';
    const result = await pool.query(query);
    return result.rows || [];
  } catch (error) {
    console.error('Error fetching all funds:', error);
    throw error;
  }
};

/**
 * Get all fund houses
 */
export const getFundHouses = async () => {
  try {
    const query = `
      SELECT DISTINCT fund_house
      FROM mutualfund_portfolio
      ORDER BY fund_house ASC
    `;
    const result = await pool.query(query);
    return result.rows.map(row => row.fund_house) || [];
  } catch (error) {
    console.error('Error fetching fund houses:', error);
    throw error;
  }
};

/**
 * Get all stocks with latest prices
 */
export const getAllStocks = async () => {
  try {
    const query = `
      SELECT
        s.id,
        s.symbol,
        s.company_name as name,
        s.exchange,
        s.sector,
        s.industry,
        s.market_cap,
        s.updated_at,
        (
          SELECT close
          FROM stock_prices
          WHERE stock_id = s.id
          ORDER BY date DESC
          LIMIT 1
        ) as current_price
      FROM stocks s
      ORDER BY s.company_name ASC
    `;
    const result = await pool.query(query);
    return result.rows || [];
  } catch (error) {
    console.error('Error fetching all stocks:', error);
    throw error;
  }
};

/**
 * Get all funds for autocomplete dropdown from all fund houses or a specific fund house
 */
export const getTickersWithFunds = async (fundHouse = null) => {
  try {
    let query = `
      SELECT DISTINCT fund_name, scheme_name, fund_house
      FROM mutualfund_portfolio
    `;

    const params = [];
    if (fundHouse) {
      query += ` WHERE fund_house = $1`;
      params.push(fundHouse);
    }

    query += ` ORDER BY fund_name ASC, scheme_name ASC`;

    const result = await pool.query(query, params);
    // Return in format expected by frontend
    return result.rows.map(row => ({
      ticker: row.fund_name, // Use fund_name as the search key
      fund_name: row.fund_name,
      fund_id: row.fund_name,
      fund_house: row.fund_house
    })) || [];
  } catch (error) {
    console.error('Error fetching funds:', error);
    throw error;
  }
};

/**
 * Search portfolio by fund name across all fund houses
 */
export const searchPortfolio = async (fundName) => {
  try {
    const query = `
      SELECT
        mp.fund_name,
        mp.scheme_name,
        mp.instrument_name,
        mp.quantity,
        mp.market_value_lacs,
        mp.percent_nav,
        mp.portfolio_date,
        mp.industry_rating,
        mp.pe_ratio,
        mp.fund_house,
        mp.stock_id,
        s.symbol,
        s.company_name as stock_company_name
      FROM mutualfund_portfolio mp
      LEFT JOIN stocks s ON s.id = mp.stock_id
      WHERE mp.fund_name = $1
      ORDER BY mp.market_value_lacs DESC
    `;
    const result = await pool.query(query, [fundName]);
    return result.rows || [];
  } catch (error) {
    console.error('Error searching portfolio:', error);
    throw error;
  }
};

/**
 * Get peer stocks in the same industry
 */
export const getPeerStocks = async (stockId) => {
  try {
    // Get the current stock's industry and symbol
    const stockQuery = `
      SELECT symbol, industry, sector
      FROM stocks
      WHERE id = $1
    `;
    const stockResult = await pool.query(stockQuery, [stockId]);

    if (stockResult.rows.length === 0) {
      throw new Error('Stock not found');
    }

    const { symbol: currentSymbol, industry, sector } = stockResult.rows[0];

    // Find peer stocks in the same industry (excluding current stock)
    // Join with stock_fundamentals using symbol (fmp_symbol in fundamentals table has .NS suffix)
    const peersQuery = `
      SELECT
        s.id,
        s.symbol,
        s.company_name,
        s.industry,
        s.sector,
        s.market_cap,
        f.pe_ratio,
        f.roe_pct as roe,
        f.roce_pct as roce,
        f.dividend_yield
      FROM stocks s
      LEFT JOIN stock_fundamentals f ON s.symbol = f.fmp_symbol
      WHERE s.industry = $1
        AND s.symbol != $2
        AND s.market_cap > 0
      ORDER BY s.market_cap DESC
      LIMIT 10
    `;
    const peersResult = await pool.query(peersQuery, [industry, currentSymbol]);

    return {
      peers: peersResult.rows,
      industry,
      sector
    };
  } catch (error) {
    console.error('Error fetching peer stocks:', error);
    throw error;
  }
};

/**
 * Close the connection pool
 */
export const closeConnection = async () => {
  try {
    await pool.end();
    console.log('Database connection pool closed');
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
  }
};

export default pool;
