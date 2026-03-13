import db from './src/db.js';
import fs from 'fs';

async function migrateNippon() {
  try {
    console.log('🔄 Adding Nippon portfolio to unified table...\n');

    // Check current state
    const beforeCount = await db.query(`
      SELECT COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon'
    `);
    console.log(`Current Nippon records: ${beforeCount.rows[0].count}`);

    // Read and execute SQL
    const sql = fs.readFileSync('add_nippon_to_unified.sql', 'utf8');
    const result = await db.query(sql);

    console.log(`✅ Inserted ${result.rowCount} new records\n`);

    // Verify the migration
    const afterCount = await db.query(`
      SELECT COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon'
    `);
    console.log(`New Nippon records: ${afterCount.rows[0].count}`);

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

    // Check some Nippon fund names
    const funds = await db.query(`
      SELECT DISTINCT fund_name
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon'
      ORDER BY fund_name
      LIMIT 10
    `);
    console.log('\nSample Nippon funds in unified table:');
    funds.rows.forEach(r => console.log(`  - ${r.fund_name}`));

    console.log('\n✨ Migration completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    console.error(e);
    process.exit(1);
  }
}

migrateNippon();
