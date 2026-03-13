-- Add SBI portfolio data to unified mutualfund_portfolio table

INSERT INTO mutualfund_portfolio (
  fund_house,
  fund_name,
  scheme_name,
  portfolio_date,
  instrument_name,
  isin,
  quantity,
  market_value_lacs,
  percent_nav,
  industry_rating,
  yield_pct,
  source_file
)
SELECT
  'SBI' as fund_house,
  fund_name,
  fund_name as scheme_name,
  portfolio_date::varchar,
  instrument_name,
  isin,
  quantity::bigint,
  market_value_lakh,
  pct_to_nav,
  industry,
  ytm,
  source_file
FROM sbi_portfolio
WHERE NOT EXISTS (
  SELECT 1 FROM mutualfund_portfolio
  WHERE fund_house = 'SBI'
  AND fund_name = sbi_portfolio.fund_name
  AND portfolio_date::varchar = sbi_portfolio.portfolio_date::varchar
  AND instrument_name = sbi_portfolio.instrument_name
);
