import db from './db.js';

/**
 * Auto-migration system.
 * Runs all pending SQL migrations on server startup.
 *
 * Uses a migrations tracking table to know what's already been applied.
 * All migrations are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */

const MIGRATIONS = [
  {
    name: '001_create_stock_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS stocks (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        exchange VARCHAR(10),
        isin VARCHAR(20),
        sector VARCHAR(100),
        industry VARCHAR(100),
        market_cap NUMERIC(20, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS stock_prices (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        open NUMERIC(12, 2),
        high NUMERIC(12, 2),
        low NUMERIC(12, 2),
        close NUMERIC(12, 2),
        volume BIGINT,
        adjusted_close NUMERIC(12, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_id, date)
      );
      CREATE TABLE IF NOT EXISTS stock_fundamentals (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
        period_type VARCHAR(10),
        fiscal_year INTEGER NOT NULL,
        fiscal_quarter INTEGER,
        revenue NUMERIC(20, 2),
        operating_income NUMERIC(20, 2),
        net_income NUMERIC(20, 2),
        ebitda NUMERIC(20, 2),
        eps NUMERIC(10, 2),
        total_assets NUMERIC(20, 2),
        total_liabilities NUMERIC(20, 2),
        shareholders_equity NUMERIC(20, 2),
        current_assets NUMERIC(20, 2),
        current_liabilities NUMERIC(20, 2),
        operating_cash_flow NUMERIC(20, 2),
        investing_cash_flow NUMERIC(20, 2),
        financing_cash_flow NUMERIC(20, 2),
        free_cash_flow NUMERIC(20, 2),
        pe_ratio NUMERIC(10, 2),
        pb_ratio NUMERIC(10, 2),
        roe NUMERIC(10, 2),
        roa NUMERIC(10, 2),
        debt_to_equity NUMERIC(10, 2),
        current_ratio NUMERIC(10, 2),
        quick_ratio NUMERIC(10, 2),
        gross_margin NUMERIC(10, 2),
        operating_margin NUMERIC(10, 2),
        net_margin NUMERIC(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_id, period_type, fiscal_year, fiscal_quarter)
      );
      CREATE TABLE IF NOT EXISTS stock_quality_scores (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
        calculated_date DATE NOT NULL,
        piotroski_score INTEGER,
        altman_z_score NUMERIC(10, 2),
        earnings_quality_score INTEGER,
        balance_sheet_quality_score INTEGER,
        cash_flow_quality_score INTEGER,
        overall_quality_score INTEGER,
        red_flags JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_id, calculated_date)
      );
      CREATE INDEX IF NOT EXISTS idx_stock_prices_stock_date ON stock_prices(stock_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);
      CREATE INDEX IF NOT EXISTS idx_stocks_sector_industry ON stocks(sector, industry);
    `
  },
  {
    name: '002_create_stock_ratings_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS stock_ratings_cache (
        symbol VARCHAR(50) PRIMARY KEY,
        company_name VARCHAR(255),
        sector VARCHAR(100),
        industry VARCHAR(100),
        market_cap NUMERIC,
        exchange VARCHAR(10),
        current_price NUMERIC(12,2),
        overall_quality_score INTEGER,
        piotroski_score INTEGER,
        magic_formula_score NUMERIC(5,2),
        canslim_score NUMERIC(5,2),
        altman_z_score NUMERIC(10,2),
        financial_health_score INTEGER,
        management_quality_score INTEGER,
        earnings_quality_score INTEGER,
        calculated_date DATE,
        cached_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stock_ratings_cache_overall_score
        ON stock_ratings_cache(overall_quality_score DESC NULLS LAST);
      CREATE INDEX IF NOT EXISTS idx_stock_ratings_cache_sector
        ON stock_ratings_cache(sector);
    `
  },
  {
    name: '003_create_fund_quality_scores',
    sql: `
      CREATE TABLE IF NOT EXISTS fund_quality_scores (
        fund_name TEXT PRIMARY KEY,
        scheme_name TEXT,
        fund_house TEXT,
        scored_holdings INTEGER,
        coverage_pct NUMERIC(5,2),
        overall_quality_score NUMERIC(5,2),
        piotroski_score NUMERIC(5,2),
        altman_z_score NUMERIC(10,2),
        financial_health_score NUMERIC(5,2),
        management_quality_score NUMERIC(5,2),
        earnings_quality_score NUMERIC(5,2),
        calculated_at TIMESTAMP DEFAULT NOW()
      );
    `
  },
  {
    name: '004_add_cagr_columns',
    sql: `
      ALTER TABLE stock_ratings_cache
        ADD COLUMN IF NOT EXISTS cagr_1y NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cagr_3y NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cagr_5y NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cagr_10y NUMERIC(8,2);
      ALTER TABLE fund_quality_scores
        ADD COLUMN IF NOT EXISTS cagr_1y NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cagr_3y NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cagr_5y NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cagr_10y NUMERIC(8,2);
    `
  },
  {
    name: '005_add_mfapi_scheme_code',
    sql: `
      ALTER TABLE fund_quality_scores
        ADD COLUMN IF NOT EXISTS mfapi_scheme_code INTEGER;
    `
  },
  {
    name: '006_add_five_pillar_scores',
    sql: `
      ALTER TABLE stock_quality_scores
        ADD COLUMN IF NOT EXISTS profitability_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS financial_strength_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS earnings_quality_score_v2 NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS growth_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS valuation_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS revenue_growth_yoy NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS eps_growth_yoy NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS margin_expansion NUMERIC(8,2);
      ALTER TABLE stock_ratings_cache
        ADD COLUMN IF NOT EXISTS profitability_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS financial_strength_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS earnings_quality_score_v2 NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS growth_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS valuation_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS revenue_growth_yoy NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS eps_growth_yoy NUMERIC(8,2);
      ALTER TABLE fund_quality_scores
        ADD COLUMN IF NOT EXISTS profitability_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS financial_strength_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS earnings_quality_score_v2 NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS growth_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS valuation_score NUMERIC(5,2);
    `
  },
  {
    name: '007_add_fund_manager',
    sql: `
      ALTER TABLE fund_quality_scores
        ADD COLUMN IF NOT EXISTS fund_manager TEXT,
        ADD COLUMN IF NOT EXISTS fund_manager_updated_at TIMESTAMP;
    `
  },
  {
    name: '008_add_fund_start_date',
    sql: `
      ALTER TABLE fund_quality_scores
        ADD COLUMN IF NOT EXISTS fund_start_date DATE;
    `
  }
];

/**
 * Run all pending migrations.
 * Creates a tracking table and only runs migrations that haven't been applied yet.
 */
export async function runMigrations() {
  try {
    // Create migrations tracking table
    await db.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const applied = await db.query('SELECT name FROM _migrations');
    const appliedSet = new Set(applied.rows.map(r => r.name));

    let ranCount = 0;
    for (const migration of MIGRATIONS) {
      if (appliedSet.has(migration.name)) continue;

      console.log(`  Running migration: ${migration.name}...`);
      await db.query(migration.sql);
      await db.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      ranCount++;
    }

    if (ranCount > 0) {
      console.log(`✅ Ran ${ranCount} migration(s)`);
    } else {
      console.log('✅ Database is up to date');
    }
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    // Don't crash the server — migrations use IF NOT EXISTS so partial runs are safe
  }
}
