import db from './src/db.js';

async function checkTable() {
  try {
    // Get table structure
    const columns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'nse_symbol_map'
      ORDER BY ordinal_position
    `);

    console.log('nse_symbol_map columns:');
    columns.rows.forEach(c => {
      console.log(`  ${c.column_name}: ${c.data_type}`);
    });

    // Sample data
    console.log('\nSample data:');
    const sample = await db.query('SELECT * FROM nse_symbol_map LIMIT 5');
    console.log(sample.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTable();
