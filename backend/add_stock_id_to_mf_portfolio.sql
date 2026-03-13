-- Add stock_id column to mutualfund_portfolio table
ALTER TABLE mutualfund_portfolio
ADD COLUMN IF NOT EXISTS stock_id INTEGER REFERENCES stocks(id);

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_mf_portfolio_stock_id ON mutualfund_portfolio(stock_id);

-- Add index on ISIN for faster matching
CREATE INDEX IF NOT EXISTS idx_mf_portfolio_isin ON mutualfund_portfolio(isin);
CREATE INDEX IF NOT EXISTS idx_stocks_isin ON stocks(isin);

-- Update stock_id by matching ISIN
UPDATE mutualfund_portfolio mfp
SET stock_id = s.id
FROM stocks s
WHERE mfp.isin = s.isin
  AND mfp.isin IS NOT NULL
  AND mfp.isin != ''
  AND s.isin IS NOT NULL
  AND s.isin != '';

-- Display results
SELECT
  COUNT(*) as total_holdings,
  COUNT(CASE WHEN stock_id IS NOT NULL THEN 1 END) as linked,
  COUNT(CASE WHEN stock_id IS NULL THEN 1 END) as not_linked,
  ROUND(COUNT(CASE WHEN stock_id IS NOT NULL THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as linked_pct
FROM mutualfund_portfolio;
