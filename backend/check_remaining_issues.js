import db from './src/db.js';

async function checkRemainingIssues() {
  try {
    const result = await db.query(`
      SELECT fund_house, fund_name, SUM(CAST(percent_nav AS DECIMAL)) as total, COUNT(*) as holdings
      FROM mutualfund_portfolio
      GROUP BY fund_house, fund_name
      HAVING SUM(CAST(percent_nav AS DECIMAL)) < 99 OR SUM(CAST(percent_nav AS DECIMAL)) > 101
      ORDER BY total DESC
    `);

    if (result.rows.length === 0) {
      console.log('✅ All funds are normalized correctly!');
    } else {
      console.log(`⚠️  Funds still outside 99-101% range:\n`);
      result.rows.forEach(row => {
        console.log(`${row.fund_house} - ${row.fund_name}`);
        console.log(`  Total: ${parseFloat(row.total).toFixed(2)}% (${row.holdings} holdings)\n`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkRemainingIssues();
