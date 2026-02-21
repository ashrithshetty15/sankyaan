import db from './src/db.js';

async function checkData() {
  try {
    // Check total records
    const totalResult = await db.query('SELECT COUNT(*) FROM mutualfund_portfolio');
    console.log('Total records:', totalResult.rows[0].count);

    // Check by fund house
    const byHouseResult = await db.query('SELECT fund_house, COUNT(*) FROM mutualfund_portfolio GROUP BY fund_house');
    console.log('\nBy fund house:');
    byHouseResult.rows.forEach(row => console.log(`  ${row.fund_house}: ${row.count}`));

    // Check sample HDFC funds
    const hdfcFunds = await db.query('SELECT DISTINCT fund_name FROM mutualfund_portfolio WHERE fund_house = $1 ORDER BY fund_name LIMIT 5', ['HDFC']);
    console.log('\nSample HDFC funds:');
    hdfcFunds.rows.forEach(row => console.log(`  - ${row.fund_name}`));

    // Check if specific fund exists
    const specific = await db.query('SELECT COUNT(*) FROM mutualfund_portfolio WHERE fund_name = $1', ['HDFC Arbitrage Fund']);
    console.log('\nHDFC Arbitrage Fund records:', specific.rows[0].count);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkData();
