import db from './src/db.js';

async function checkNullPercentages() {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(percent_nav) as with_pct,
        COUNT(*) - COUNT(percent_nav) as null_pct
      FROM mutualfund_portfolio
    `);

    console.log('📊 Percentage Statistics:');
    console.log(`Total records: ${stats.rows[0].total}`);
    console.log(`Records with percent_nav: ${stats.rows[0].with_pct}`);
    console.log(`Records with NULL percent_nav: ${stats.rows[0].null_pct}`);

    // Check which funds have NULL percentages
    const nullByFund = await db.query(`
      SELECT fund_house, fund_name, COUNT(*) as null_count
      FROM mutualfund_portfolio
      WHERE percent_nav IS NULL
      GROUP BY fund_house, fund_name
      ORDER BY null_count DESC
      LIMIT 20
    `);

    console.log('\n⚠️  Funds with NULL percent_nav:');
    nullByFund.rows.forEach(r => {
      console.log(`  ${r.fund_house} - ${r.fund_name}: ${r.null_count} NULL records`);
    });

    // Sample NULL records
    const sample = await db.query(`
      SELECT fund_name, instrument_name, percent_nav, market_value_lacs
      FROM mutualfund_portfolio
      WHERE percent_nav IS NULL
      LIMIT 10
    `);

    console.log('\n📋 Sample NULL percent_nav records:');
    sample.rows.forEach(s => {
      console.log(`  ${s.fund_name}: ${s.instrument_name} - percent: ${s.percent_nav}, value: ${s.market_value_lacs}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkNullPercentages();
