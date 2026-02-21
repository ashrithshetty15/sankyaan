import db from './src/db.js';

async function checkMutualFundPortfolio() {
  const r = await db.query(`
    SELECT DISTINCT fund_name, scheme_name
    FROM mutualfund_portfolio
    WHERE fund_name LIKE '%360%'
    ORDER BY fund_name
  `);

  console.log('360 ONE funds in mutualfund_portfolio:');
  r.rows.forEach((row, i) => {
    console.log(`${i + 1}. ${row.fund_name}`);
    if (row.scheme_name && row.scheme_name !== row.fund_name) {
      console.log(`   Scheme: ${row.scheme_name}`);
    }
  });

  process.exit(0);
}

checkMutualFundPortfolio();
