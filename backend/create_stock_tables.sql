-- Create tables for stock data

-- Main stock information table
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  exchange VARCHAR(10), -- NSE, BSE
  isin VARCHAR(20),
  sector VARCHAR(100),
  industry VARCHAR(100),
  market_cap NUMERIC(20, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock price data (current and historical)
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

-- Stock fundamentals (quarterly/annual)
CREATE TABLE IF NOT EXISTS stock_fundamentals (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
  period_type VARCHAR(10), -- 'Q' for quarterly, 'A' for annual
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER, -- 1, 2, 3, 4 or NULL for annual

  -- Income Statement
  revenue NUMERIC(20, 2),
  operating_income NUMERIC(20, 2),
  net_income NUMERIC(20, 2),
  ebitda NUMERIC(20, 2),
  eps NUMERIC(10, 2),

  -- Balance Sheet
  total_assets NUMERIC(20, 2),
  total_liabilities NUMERIC(20, 2),
  shareholders_equity NUMERIC(20, 2),
  current_assets NUMERIC(20, 2),
  current_liabilities NUMERIC(20, 2),

  -- Cash Flow
  operating_cash_flow NUMERIC(20, 2),
  investing_cash_flow NUMERIC(20, 2),
  financing_cash_flow NUMERIC(20, 2),
  free_cash_flow NUMERIC(20, 2),

  -- Key Ratios
  pe_ratio NUMERIC(10, 2),
  pb_ratio NUMERIC(10, 2),
  roe NUMERIC(10, 2), -- Return on Equity
  roa NUMERIC(10, 2), -- Return on Assets
  debt_to_equity NUMERIC(10, 2),
  current_ratio NUMERIC(10, 2),
  quick_ratio NUMERIC(10, 2),

  -- Margins
  gross_margin NUMERIC(10, 2),
  operating_margin NUMERIC(10, 2),
  net_margin NUMERIC(10, 2),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, period_type, fiscal_year, fiscal_quarter)
);

-- Shareholding pattern
CREATE TABLE IF NOT EXISTS shareholding_pattern (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  promoter_holding NUMERIC(5, 2),
  fii_holding NUMERIC(5, 2),
  dii_holding NUMERIC(5, 2),
  public_holding NUMERIC(5, 2),
  promoter_pledged NUMERIC(5, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, date)
);

-- Forensic/Quality scores
CREATE TABLE IF NOT EXISTS stock_quality_scores (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
  calculated_date DATE NOT NULL,

  -- Piotroski F-Score (0-9, higher is better)
  piotroski_score INTEGER,

  -- Altman Z-Score (bankruptcy risk)
  altman_z_score NUMERIC(10, 2),

  -- Custom quality metrics
  earnings_quality_score INTEGER, -- 0-100
  balance_sheet_quality_score INTEGER, -- 0-100
  cash_flow_quality_score INTEGER, -- 0-100
  overall_quality_score INTEGER, -- 0-100

  -- Red flags
  red_flags JSONB, -- Store array of red flag descriptions

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, calculated_date)
);

-- Peer comparison groups
CREATE TABLE IF NOT EXISTS peer_groups (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(100) NOT NULL,
  sector VARCHAR(100),
  industry VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS peer_group_stocks (
  id SERIAL PRIMARY KEY,
  peer_group_id INTEGER REFERENCES peer_groups(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
  UNIQUE(peer_group_id, stock_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stock_prices_stock_date ON stock_prices(stock_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_fundamentals_stock ON stock_fundamentals(stock_id, fiscal_year DESC, fiscal_quarter DESC);
CREATE INDEX IF NOT EXISTS idx_shareholding_stock_date ON shareholding_pattern(stock_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_stocks_sector_industry ON stocks(sector, industry);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stocks_updated_at BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_fundamentals_updated_at BEFORE UPDATE ON stock_fundamentals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_quality_scores_updated_at BEFORE UPDATE ON stock_quality_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
