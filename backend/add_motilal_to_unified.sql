-- Add Motilal Oswal portfolio data to unified mutualfund_portfolio table

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
  source_file
)
SELECT
  'Motilal Oswal' as fund_house,
  fund_name,
  fund_name as scheme_name,
  portfolio_date::varchar,
  instrument_name,
  isin,
  quantity::bigint,
  market_value_lakh,
  pct_to_nav,
  industry,
  source_file
FROM motilal_portfolio
WHERE NOT EXISTS (
  SELECT 1 FROM mutualfund_portfolio
  WHERE fund_house = 'Motilal Oswal'
  AND fund_name = motilal_portfolio.fund_name
  AND portfolio_date::varchar = motilal_portfolio.portfolio_date::varchar
  AND instrument_name = motilal_portfolio.instrument_name
);
