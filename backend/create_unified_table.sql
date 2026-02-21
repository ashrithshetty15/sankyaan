-- Create unified mutual fund portfolio table
CREATE TABLE IF NOT EXISTS mutualfund_portfolio (
  id SERIAL PRIMARY KEY,
  fund_house VARCHAR(50) NOT NULL,
  fund_name VARCHAR(255),
  scheme_name VARCHAR(100),
  portfolio_date VARCHAR(50),
  source_file VARCHAR(255),
  sheet_name VARCHAR(100),
  isin VARCHAR(20),
  coupon_pct DECIMAL(10, 2),
  instrument_name VARCHAR(255),
  industry_rating VARCHAR(100),
  quantity BIGINT,
  market_value_lacs DECIMAL(15, 2),
  percent_nav DECIMAL(10, 2),
  yield_pct DECIMAL(10, 2),
  ytc_at1_tier2 VARCHAR(50),
  derivative VARCHAR(50),
  unhedged DECIMAL(10, 2),
  pe_ratio DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mf_fund_house ON mutualfund_portfolio(fund_house);
CREATE INDEX IF NOT EXISTS idx_mf_fund_name ON mutualfund_portfolio(fund_name);
CREATE INDEX IF NOT EXISTS idx_mf_scheme_name ON mutualfund_portfolio(scheme_name);
CREATE INDEX IF NOT EXISTS idx_mf_industry ON mutualfund_portfolio(industry_rating);
CREATE INDEX IF NOT EXISTS idx_mf_pe_ratio ON mutualfund_portfolio(pe_ratio);
CREATE INDEX IF NOT EXISTS idx_mf_combined ON mutualfund_portfolio(fund_house, fund_name);

-- Migrate data from hdfc_portfolio to mutualfund_portfolio
INSERT INTO mutualfund_portfolio (
  fund_house, fund_name, scheme_name, portfolio_date, source_file, sheet_name,
  isin, coupon_pct, instrument_name, industry_rating, quantity,
  market_value_lacs, percent_nav, yield_pct, ytc_at1_tier2, derivative, unhedged, pe_ratio
)
SELECT
  'HDFC' as fund_house,
  fund_name, scheme_name, portfolio_date, source_file, sheet_name,
  isin, coupon_pct, instrument_name, industry_rating, quantity,
  market_value_lacs, percent_nav, yield_pct, ytc_at1_tier2, derivative, unhedged, pe_ratio
FROM hdfc_portfolio
ON CONFLICT DO NOTHING;

-- Migrate data from helios_portfolio with column mapping
INSERT INTO mutualfund_portfolio (
  fund_house, fund_name, scheme_name, portfolio_date, source_file,
  isin, coupon_pct, instrument_name, industry_rating, quantity,
  market_value_lacs, percent_nav, yield_pct, pe_ratio
)
SELECT
  'Helios' as fund_house,
  fund_name,
  scheme_name,
  portfolio_date,
  source_file,
  instrument_isin as isin,
  coupon_rate as coupon_pct,
  instrument_name,
  industry as industry_rating,
  quantity,
  market_value_lakh as market_value_lacs,
  pct_to_nav as percent_nav,
  yield_to_maturity as yield_pct,
  NULL as pe_ratio
FROM helios_portfolio
ON CONFLICT DO NOTHING;

-- Add comment to table
COMMENT ON TABLE mutualfund_portfolio IS 'Unified table for all mutual fund portfolio holdings across different fund houses';
