import db from './src/db.js';
import fs from 'fs';

async function setupStockTables() {
  try {
    console.log('📊 Setting up stock data tables...\n');

    // Read and execute SQL
    const sql = fs.readFileSync('create_stock_tables.sql', 'utf8');
    await db.query(sql);

    console.log('✅ Stock tables created successfully!');

    // Verify tables
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('stocks', 'stock_prices', 'stock_fundamentals', 'shareholding_pattern', 'stock_quality_scores', 'peer_groups', 'peer_group_stocks')
      ORDER BY table_name
    `);

    console.log('\n📋 Created tables:');
    tables.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

setupStockTables();
