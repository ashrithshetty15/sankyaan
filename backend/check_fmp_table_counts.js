import db from './src/db.js';

async function checkCounts() {
  const tables = ['stock_quotes', 'stock_financials', 'stock_balance_sheet', 'stock_cash_flow', 'stock_key_metrics'];

  console.log('📊 FMP Table Row Counts:\n');

  for (const table of tables) {
    const result = await db.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`${table.padEnd(25)} ${result.rows[0].count}`);
  }

  process.exit(0);
}

checkCounts();
