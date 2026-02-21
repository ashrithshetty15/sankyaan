import db from './src/db.js';
import fs from 'fs';

async function migrateToUnified() {
  try {
    console.log('🔄 Starting migration to unified mutualfund_portfolio table...\n');

    const sql = fs.readFileSync('create_unified_table.sql', 'utf8');

    // Execute the entire SQL file as one transaction
    await db.query(sql);
    console.log('✅ Table created and data migrated');

    // Verify the migration
    const countResult = await db.query('SELECT fund_house, COUNT(*) as count FROM mutualfund_portfolio GROUP BY fund_house ORDER BY fund_house');

    console.log('\n📊 Migration Summary:');
    console.log('─'.repeat(40));
    countResult.rows.forEach(row => {
      console.log(`${row.fund_house.padEnd(15)}: ${row.count.toString().padStart(8)} records`);
    });
    console.log('─'.repeat(40));

    const totalResult = await db.query('SELECT COUNT(*) as total FROM mutualfund_portfolio');
    console.log(`${'TOTAL'.padEnd(15)}: ${totalResult.rows[0].total.toString().padStart(8)} records`);

    console.log('\n✨ Migration completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  }
}

migrateToUnified();
