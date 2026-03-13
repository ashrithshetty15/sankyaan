import db from './src/db.js';
import fs from 'fs';

async function runAlterTable() {
  try {
    console.log('📝 Adding missing columns to stock_quality_scores table...\n');

    const sql = fs.readFileSync('c:/Users/ashri/OneDrive/Sankyaan/backend/add_quality_score_columns.sql', 'utf8');
    await db.query(sql);

    console.log('✅ Columns added successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runAlterTable();
