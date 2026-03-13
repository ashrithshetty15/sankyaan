import db from './src/db.js';
import fs from 'fs';

async function migrateSBI() {
  try {
    console.log('🔄 Adding SBI portfolio to unified table...\n');

    // Check current state
    const beforeCount = await db.query(`
      SELECT COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_house = 'SBI'
    `);
    console.log(`Current SBI records: ${beforeCount.rows[0].count}`);

    // Read and execute SQL
    const sql = fs.readFileSync('add_sbi_to_unified.sql', 'utf8');
    const result = await db.query(sql);

    console.log(`✅ Inserted ${result.rowCount} new records\n`);

    // Verify the migration
    const afterCount = await db.query(`
      SELECT COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_house = 'SBI'
    `);
    console.log(`New SBI records: ${afterCount.rows[0].count}`);

    // Show summary by fund house
    const summary = await db.query(`
      SELECT fund_house, COUNT(*) as count
      FROM mutualfund_portfolio
      GROUP BY fund_house
      ORDER BY fund_house
    `);

    console.log('\n📊 Updated Summary:');
    console.log('─'.repeat(40));
    summary.rows.forEach(row => {
      console.log(`${row.fund_house.padEnd(15)}: ${row.count.toString().padStart(8)} records`);
    });
    console.log('─'.repeat(40));

    const total = await db.query('SELECT COUNT(*) as total FROM mutualfund_portfolio');
    console.log(`${'TOTAL'.padEnd(15)}: ${total.rows[0].total.toString().padStart(8)} records`);

    // Check some SBI fund names
    const funds = await db.query(`
      SELECT DISTINCT fund_name
      FROM mutualfund_portfolio
      WHERE fund_house = 'SBI'
      ORDER BY fund_name
      LIMIT 10
    `);
    console.log('\nSample SBI funds in unified table:');
    funds.rows.forEach(r => console.log(`  - ${r.fund_name}`));

    console.log('\n✨ Migration completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    console.error(e);
    process.exit(1);
  }
}

migrateSBI();
