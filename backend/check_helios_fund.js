import db from './src/db.js';

async function checkHeliosFund() {
  try {
    const fundName = 'Helios Balanced Advantage Fund';

    console.log(`🔍 Checking: ${fundName}\n`);

    // Check total records
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM mutualfund_portfolio WHERE fund_name = $1',
      [fundName]
    );
    console.log(`Total records: ${countResult.rows[0].count}`);

    // Check distinct dates
    const datesResult = await db.query(
      'SELECT DISTINCT portfolio_date, COUNT(*) as count FROM mutualfund_portfolio WHERE fund_name = $1 GROUP BY portfolio_date ORDER BY portfolio_date DESC',
      [fundName]
    );
    console.log('\nPortfolio dates:');
    datesResult.rows.forEach(row => {
      console.log(`  ${row.portfolio_date}: ${row.count} holdings`);
    });

    // Check sum of percentages by date
    const sumByDate = await db.query(
      'SELECT portfolio_date, SUM(CAST(percent_nav AS DECIMAL)) as total_pct FROM mutualfund_portfolio WHERE fund_name = $1 GROUP BY portfolio_date ORDER BY portfolio_date DESC',
      [fundName]
    );
    console.log('\nTotal allocation by date:');
    sumByDate.rows.forEach(row => {
      console.log(`  ${row.portfolio_date}: ${parseFloat(row.total_pct).toFixed(2)}%`);
    });

    // Sample holdings
    const sampleResult = await db.query(
      'SELECT instrument_name, percent_nav, portfolio_date FROM mutualfund_portfolio WHERE fund_name = $1 LIMIT 10',
      [fundName]
    );
    console.log('\nSample holdings:');
    sampleResult.rows.forEach(row => {
      console.log(`  ${row.instrument_name}: ${row.percent_nav}% (${row.portfolio_date})`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkHeliosFund();
