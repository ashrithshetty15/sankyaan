import db from './src/db.js';

async function checkNippon() {
  try {
    // Check columns
    const columns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'nippon_portfolio'
      ORDER BY ordinal_position
    `);

    console.log('📋 Nippon Portfolio columns:');
    columns.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

    // Check total records
    const count = await db.query('SELECT COUNT(*) FROM nippon_portfolio');
    console.log(`\nTotal records: ${count.rows[0].count}`);

    // Check sample data
    const sample = await db.query('SELECT * FROM nippon_portfolio LIMIT 3');
    console.log('\nSample data:');
    console.log(JSON.stringify(sample.rows, null, 2));

    // Check distinct fund names
    const funds = await db.query('SELECT DISTINCT fund_name FROM nippon_portfolio ORDER BY fund_name');
    console.log('\nDistinct fund names:');
    funds.rows.forEach(r => console.log(`  - ${r.fund_name}`));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkNippon();
