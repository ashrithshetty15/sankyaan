import db from './src/db.js';
import fs from 'fs';

async function populatePERatios() {
  try {
    const sql = fs.readFileSync('sample_pe_data.sql', 'utf8');
    const statements = sql
      .split(';')
      .filter(s => s.trim() && !s.trim().startsWith('--'));

    let total = 0;

    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          const result = await db.query(stmt);
          total += result.rowCount || 0;
          console.log('Updated', result.rowCount || 0, 'rows');
        } catch (e) {
          console.error('Error:', e.message);
        }
      }
    }

    console.log('\nTotal rows updated:', total);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

populatePERatios();
