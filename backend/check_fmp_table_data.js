import db from './src/db.js';

async function checkFMPTableData() {
  try {
    console.log('📊 Checking FMP Table Column Data\n');

    // Check stock_key_metrics columns
    console.log('=== stock_key_metrics ===');
    const kmResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(pb_ratio) as pb_ratio,
        COUNT(debt_to_equity) as debt_to_equity,
        COUNT(current_ratio) as current_ratio,
        COUNT(roe) as roe,
        COUNT(roce) as roce,
        COUNT(dividend_yield) as dividend_yield
      FROM stock_key_metrics
    `);
    const km = kmResult.rows[0];
    console.log(`Total records: ${km.total}`);
    console.log(`pb_ratio: ${km.pb_ratio} (${(km.pb_ratio / km.total * 100).toFixed(1)}%)`);
    console.log(`debt_to_equity: ${km.debt_to_equity} (${(km.debt_to_equity / km.total * 100).toFixed(1)}%)`);
    console.log(`current_ratio: ${km.current_ratio} (${(km.current_ratio / km.total * 100).toFixed(1)}%)`);
    console.log(`roe: ${km.roe} (${(km.roe / km.total * 100).toFixed(1)}%)`);
    console.log(`roce: ${km.roce} (${(km.roce / km.total * 100).toFixed(1)}%)`);
    console.log(`dividend_yield: ${km.dividend_yield} (${(km.dividend_yield / km.total * 100).toFixed(1)}%)`);

    // Check stock_financials columns
    console.log('\n=== stock_financials ===');
    const finResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(net_income_ratio) as net_income_ratio,
        COUNT(operating_income_ratio) as operating_income_ratio,
        COUNT(ebitda_ratio) as ebitda_ratio,
        COUNT(gross_profit_ratio) as gross_profit_ratio
      FROM stock_financials
    `);
    const fin = finResult.rows[0];
    console.log(`Total records: ${fin.total}`);
    console.log(`net_income_ratio: ${fin.net_income_ratio} (${(fin.net_income_ratio / fin.total * 100).toFixed(1)}%)`);
    console.log(`operating_income_ratio: ${fin.operating_income_ratio} (${(fin.operating_income_ratio / fin.total * 100).toFixed(1)}%)`);
    console.log(`ebitda_ratio: ${fin.ebitda_ratio} (${(fin.ebitda_ratio / fin.total * 100).toFixed(1)}%)`);

    // Check stock_cash_flow
    console.log('\n=== stock_cash_flow ===');
    const cfResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(free_cash_flow) as free_cash_flow,
        COUNT(operating_cash_flow) as operating_cash_flow
      FROM stock_cash_flow
    `);
    const cf = cfResult.rows[0];
    console.log(`Total records: ${cf.total}`);
    if (parseInt(cf.total) > 0) {
      console.log(`free_cash_flow: ${cf.free_cash_flow} (${(cf.free_cash_flow / cf.total * 100).toFixed(1)}%)`);
      console.log(`operating_cash_flow: ${cf.operating_cash_flow} (${(cf.operating_cash_flow / cf.total * 100).toFixed(1)}%)`);
    } else {
      console.log('⚠️  Table is EMPTY!');
    }

    // Sample data from stock_key_metrics for RELIANCE
    console.log('\n=== Sample: RELIANCE.NS from stock_key_metrics ===');
    const sampleKM = await db.query(`
      SELECT period_end, pb_ratio, debt_to_equity, current_ratio, roe, roce, dividend_yield
      FROM stock_key_metrics
      WHERE fmp_symbol = 'RELIANCE.NS'
      ORDER BY period_end DESC
      LIMIT 1
    `);
    if (sampleKM.rows.length > 0) {
      const s = sampleKM.rows[0];
      console.log(`Period: ${s.period_end}`);
      console.log(`pb_ratio: ${s.pb_ratio}`);
      console.log(`debt_to_equity: ${s.debt_to_equity}`);
      console.log(`current_ratio: ${s.current_ratio}`);
      console.log(`roe: ${s.roe}`);
      console.log(`roce: ${s.roce}`);
      console.log(`dividend_yield: ${s.dividend_yield}`);
    }

    // Sample data from stock_financials for RELIANCE
    console.log('\n=== Sample: RELIANCE.NS from stock_financials ===');
    const sampleFin = await db.query(`
      SELECT period_end, net_income_ratio, operating_income_ratio, ebitda_ratio
      FROM stock_financials
      WHERE fmp_symbol = 'RELIANCE.NS'
      ORDER BY period_end DESC
      LIMIT 1
    `);
    if (sampleFin.rows.length > 0) {
      const s = sampleFin.rows[0];
      console.log(`Period: ${s.period_end}`);
      console.log(`net_income_ratio: ${s.net_income_ratio}`);
      console.log(`operating_income_ratio: ${s.operating_income_ratio}`);
      console.log(`ebitda_ratio: ${s.ebitda_ratio}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkFMPTableData();
