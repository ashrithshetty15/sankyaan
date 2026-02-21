import db from './src/db.js';

async function checkNifty500() {
  try {
    const fundName = 'Nippon India Nifty 500 Equal Weight Index Fund';

    console.log(`🔍 Checking: ${fundName}\n`);

    // Check sample data
    const sample = await db.query(`
      SELECT instrument_name, percent_nav, market_value_lacs
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon' AND fund_name = $1
      LIMIT 10
    `, [fundName]);

    console.log('Sample holdings:');
    sample.rows.forEach(row => {
      console.log(`  ${row.instrument_name}: percent_nav=${row.percent_nav}, market_value=${row.market_value_lacs}`);
    });

    // Check for NULL or NaN values
    const nullCheck = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN percent_nav IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN percent_nav = 'NaN' THEN 1 END) as nan_count
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon' AND fund_name = $1
    `, [fundName]);

    console.log(`\nData quality:`);
    console.log(`  Total holdings: ${nullCheck.rows[0].total}`);
    console.log(`  NULL percent_nav: ${nullCheck.rows[0].null_count}`);
    console.log(`  NaN percent_nav: ${nullCheck.rows[0].nan_count}`);

    // Try to calculate total with filtering
    const totalCheck = await db.query(`
      SELECT
        SUM(CAST(percent_nav AS DECIMAL)) FILTER (WHERE percent_nav IS NOT NULL AND percent_nav::text != 'NaN') as valid_total,
        COUNT(*) FILTER (WHERE percent_nav IS NOT NULL AND percent_nav::text != 'NaN') as valid_count
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon' AND fund_name = $1
    `, [fundName]);

    console.log(`\nValid data:`);
    console.log(`  Valid holdings: ${totalCheck.rows[0].valid_count}`);
    console.log(`  Valid total: ${totalCheck.rows[0].valid_total}`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

checkNifty500();
