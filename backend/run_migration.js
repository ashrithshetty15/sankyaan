import db from './src/db.js';
import fs from 'fs';

async function runMigration() {
  try {
    console.log('🔄 Running database migration...\n');

    const sql = fs.readFileSync('./add_scoring_columns.sql', 'utf8');

    await db.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('   - Added magic_formula_score column');
    console.log('   - Added canslim_score column\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
