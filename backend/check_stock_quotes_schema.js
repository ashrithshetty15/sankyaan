import db from './src/db.js';

async function checkSchema() {
  try {
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'stock_quotes'
      ORDER BY ordinal_position
    `);

    console.log('stock_quotes table columns:\n');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(30)} ${col.data_type}`);
    });

    // Check if market_cap columns exist
    const hasMC = result.rows.find(c => c.column_name === 'market_cap');
    const hasMCCr = result.rows.find(c => c.column_name === 'market_cap_cr');

    console.log('\n');
    console.log('market_cap column exists:', hasMC ? 'YES' : 'NO');
    console.log('market_cap_cr column exists:', hasMCCr ? 'YES' : 'NO');

    // Sample data
    console.log('\n📊 Sample data from stock_quotes:\n');
    const sample = await db.query('SELECT * FROM stock_quotes LIMIT 1');
    if (sample.rows.length > 0) {
      const cols = Object.keys(sample.rows[0]);
      cols.forEach(col => {
        const val = sample.rows[0][col];
        console.log(`${col}: ${val !== null ? val : 'NULL'}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
