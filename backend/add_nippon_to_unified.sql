-- Add Nippon portfolio data to unified mutualfund_portfolio table

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
  coupon_pct,
  yield_pct,
  source_file
)
SELECT
  'Nippon' as fund_house,
  fund_name,
  fund_name as scheme_name,
  portfolio_date::varchar,
  instrument_name,
  isin,
  quantity::bigint,
  market_value_lakh,
  pct_to_nav,
  industry,
  coupon_rate,
  ytm,
  source_file
FROM nippon_portfolio
WHERE NOT EXISTS (
  SELECT 1 FROM mutualfund_portfolio
  WHERE fund_house = 'Nippon'
  AND fund_name = nippon_portfolio.fund_name
  AND portfolio_date::varchar = nippon_portfolio.portfolio_date::varchar
  AND instrument_name = nippon_portfolio.instrument_name
);
