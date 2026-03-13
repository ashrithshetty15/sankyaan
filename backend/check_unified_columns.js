import db from './src/db.js';

async function checkColumns() {
  try {
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'mutualfund_portfolio'
      ORDER BY ordinal_position
    `);

    console.log('mutualfund_portfolio columns:');
    result.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkColumns();
