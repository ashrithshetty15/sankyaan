-- Create stock_ratings_cache table for fast serving of stock ratings
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stock_ratings_cache_overall_score
  ON stock_ratings_cache(overall_quality_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_ratings_cache_sector
  ON stock_ratings_cache(sector);

COMMENT ON TABLE stock_ratings_cache IS 'Pre-computed stock ratings cache for fast API responses. Refresh with compute_stock_ratings_cache.js';
