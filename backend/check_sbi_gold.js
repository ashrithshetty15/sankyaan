import db from './src/db.js';

async function checkSBIGold() {
  try {
    const fundName = 'SBI Gold ETF';

    console.log(`🔍 Checking: ${fundName}\n`);

    // Check all holdings
    const holdings = await db.query(`
      SELECT instrument_name, percent_nav, market_value_lacs, quantity
      FROM mutualfund_portfolio
      WHERE fund_house = 'SBI' AND fund_name = $1
      ORDER BY percent_nav DESC NULLS LAST
    `, [fundName]);

    console.log('All holdings:');
    holdings.rows.forEach(row => {
      console.log(`  ${row.instrument_name}:`);
      console.log(`    percent_nav: ${row.percent_nav}`);
      console.log(`    market_value: ${row.market_value_lacs}`);
      console.log(`    quantity: ${row.quantity}`);
    });

    // Check the source data
    console.log('\n📋 Original data from sbi_portfolio:');
    const sourceData = await db.query(`
      SELECT instrument_name, pct_to_nav, market_value_lakh, quantity
      FROM sbi_portfolio
      WHERE fund_name = $1
      ORDER BY pct_to_nav DESC NULLS LAST
    `, [fundName]);

    sourceData.rows.forEach(row => {
      console.log(`  ${row.instrument_name}:`);
      console.log(`    pct_to_nav: ${row.pct_to_nav}`);
      console.log(`    market_value: ${row.market_value_lakh}`);
      console.log(`    quantity: ${row.quantity}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

checkSBIGold();
