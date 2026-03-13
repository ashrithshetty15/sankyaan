import db from './src/db.js';
import fs from 'fs';

async function runMigration() {
  try {
    console.log('🔄 Creating stock_ratings_cache table...\n');

    const sql = fs.readFileSync('./create_stock_ratings_cache.sql', 'utf8');
    await db.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('   - Created stock_ratings_cache table');
    console.log('   - Added indexes for performance\n');
    console.log('📝 Next step: Run `node compute_stock_ratings_cache.js` to populate the cache');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
