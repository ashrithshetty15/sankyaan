import db from './src/db.js';

async function run() {
  try {
    // Small cap in India = market_cap < 5000 crore = 50,000,000,000
    const result = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        s.sector,
        s.industry,
        s.market_cap,
        s.current_price,
        f.pe_ratio,
        COALESCE(f.roe_pct, f.roe_fmp) as roe,
        COALESCE(f.roce_pct, f.roce_fmp) as roce,
        f.pb_ratio,
        f.net_margin,
        f.debt_to_equity,
        COUNT(DISTINCT mp.fund_name) as fund_count,
        STRING_AGG(DISTINCT mp.fund_house, ', ' ORDER BY mp.fund_house) as fund_houses
      FROM stocks s
      JOIN stock_fundamentals f ON s.symbol = f.fmp_symbol
      JOIN mutualfund_portfolio mp ON mp.stock_id = s.id
      WHERE
        s.market_cap BETWEEN 1000000000 AND 50000000000
        AND COALESCE(f.roe_pct, f.roe_fmp) > 20
        AND COALESCE(f.roce_pct, f.roce_fmp) > 20
        AND f.pe_ratio > 0 AND f.pe_ratio < 40
      GROUP BY s.symbol, s.company_name, s.sector, s.industry, s.market_cap,
               s.current_price, f.pe_ratio, f.roe_pct, f.roe_fmp,
               f.roce_pct, f.roce_fmp, f.pb_ratio, f.net_margin, f.debt_to_equity
      HAVING COUNT(DISTINCT mp.fund_name) >= 3
      ORDER BY fund_count DESC, f.pe_ratio ASC
      LIMIT 15
    `);

    console.log(JSON.stringify(result.rows, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
    // Try with stocks table current_price directly
    const r2 = await db.query(`
      SELECT
        s.symbol, s.company_name, s.sector, s.market_cap,
        s.current_price,
        sf.roe, sf.roce, sf.pe_ratio, sf.pb_ratio,
        COUNT(DISTINCT mp.fund_name) as fund_count
      FROM stocks s
      JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      JOIN mutualfund_portfolio mp ON mp.stock_id = s.id
      WHERE s.market_cap < 50000000000 AND s.market_cap > 1000000000
        AND sf.roe > 20 AND sf.roce > 20
        AND sf.pe_ratio > 0 AND sf.pe_ratio < 40
      GROUP BY s.symbol, s.company_name, s.sector, s.market_cap, s.current_price, sf.roe, sf.roce, sf.pe_ratio, sf.pb_ratio
      HAVING COUNT(DISTINCT mp.fund_name) >= 3
      ORDER BY fund_count DESC, sf.pe_ratio ASC
      LIMIT 15
    `).catch(e2 => { console.error('Error2:', e2.message); return { rows: [] }; });
    console.log(JSON.stringify(r2.rows, null, 2));
  } finally {
    await db.end();
    process.exit(0);
  }
}
run();
