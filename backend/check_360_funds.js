import db from './src/db.js';

async function check360Funds() {
  const r = await db.query(`
    SELECT DISTINCT mutual_fund_name
    FROM hdfc_mutual_fund
    WHERE mutual_fund_name ILIKE '%360%'
    ORDER BY mutual_fund_name
  `);

  console.log(`Found ${r.rows.length} unique 360 ONE fund names:\n`);
  r.rows.forEach((row, i) => {
    console.log(`${i + 1}. ${row.mutual_fund_name}`);
  });

  process.exit(0);
}

check360Funds();
