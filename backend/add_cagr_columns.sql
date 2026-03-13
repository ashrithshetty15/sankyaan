-- Add CAGR columns to stock_ratings_cache
ALTER TABLE stock_ratings_cache
  ADD COLUMN IF NOT EXISTS cagr_1y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cagr_3y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cagr_5y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cagr_10y NUMERIC(8,2);

-- Add CAGR columns to fund_quality_scores
ALTER TABLE fund_quality_scores
  ADD COLUMN IF NOT EXISTS cagr_1y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cagr_3y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cagr_5y NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS cagr_10y NUMERIC(8,2);
