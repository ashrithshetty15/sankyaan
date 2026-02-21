import db from './src/db.js';

async function check360Portfolio() {
  // Get column names
  const cols = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'portfolio_360_one'
    ORDER BY ordinal_position
  `);

  console.log('Columns in portfolio_360_one:');
  cols.rows.forEach(row => console.log('  -', row.column_name));

  // Get distinct fund names
  const funds = await db.query(`
    SELECT DISTINCT scheme_name
    FROM portfolio_360_one
    ORDER BY scheme_name
  `);

  console.log('\n360 ONE Funds:');
  funds.rows.forEach((row, i) => {
    console.log(`${i + 1}. ${row.scheme_name}`);
  });

  // Check asset_type values
  const assetTypes = await db.query(`
    SELECT DISTINCT asset_type, COUNT(*) as count
    FROM portfolio_360_one
    GROUP BY asset_type
    ORDER BY asset_type
  `);

  console.log('\nAsset Types:');
  assetTypes.rows.forEach(row => {
    console.log(`  - ${row.asset_type || 'NULL'}: ${row.count} holdings`);
  });

  process.exit(0);
}

check360Portfolio();
