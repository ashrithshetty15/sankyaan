import db from './src/db.js';

async function testQuery() {
  const result = await db.query(`
    SELECT
      s.id as stock_id,
      s.symbol,
      s.market_cap,
      sf.period_type, sf.fiscal_year,
      sf.revenue, sf.net_income,
      sf.pe_ratio, sf.pb_ratio,
      COALESCE(sf.roe,
        CASE WHEN (sf.total_assets - sf.total_liabilities) > 0 AND sf.net_income IS NOT NULL
             THEN (sf.net_income / NULLIF(sf.total_assets - sf.total_liabilities, 0)) * 100
             ELSE NULL END
      ) as roe,
      COALESCE(sf.roa,
        CASE WHEN sf.total_assets > 0 AND sf.net_income IS NOT NULL
             THEN (sf.net_income / NULLIF(sf.total_assets, 0)) * 100
             ELSE NULL END
      ) as roa,
      sf.gross_margin, sf.operating_margin, sf.net_margin,
      sp.promoter_holding, sp.fii_holding, sp.dii_holding
    FROM stocks s
    INNER JOIN LATERAL (
      SELECT *
      FROM stock_fundamentals
      WHERE stock_id = s.id
      ORDER BY fiscal_year DESC, id DESC
      LIMIT 1
    ) sf ON true
    LEFT JOIN LATERAL (
      SELECT *
      FROM shareholding_pattern
      WHERE stock_id = s.id
      ORDER BY date DESC
      LIMIT 1
    ) sp ON true
    WHERE s.symbol = 'TCS.NS'
  `);

  console.log('Query result with LATERAL joins:');
  console.log(JSON.stringify(result.rows[0], null, 2));

  process.exit(0);
}

testQuery();
