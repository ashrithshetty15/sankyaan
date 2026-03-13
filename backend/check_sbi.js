import db from './src/db.js';

async function checkSBI() {
  try {
    // Check columns
    const columns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sbi_portfolio'
      ORDER BY ordinal_position
    `);

    console.log('📋 SBI Portfolio columns:');
    columns.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

    // Check total records
    const count = await db.query('SELECT COUNT(*) FROM sbi_portfolio');
    console.log(`\nTotal records: ${count.rows[0].count}`);

    // Check sample data
    const sample = await db.query('SELECT * FROM sbi_portfolio LIMIT 3');
    console.log('\nSample data:');
    console.log(JSON.stringify(sample.rows, null, 2));

    // Check distinct fund names
    const funds = await db.query('SELECT DISTINCT fund_name, COUNT(*) as holdings FROM sbi_portfolio GROUP BY fund_name ORDER BY fund_name LIMIT 15');
    console.log('\nDistinct fund names (first 15):');
    funds.rows.forEach(r => console.log(`  - ${r.fund_name} (${r.holdings} holdings)`));

    // Check portfolio dates
    const dates = await db.query('SELECT DISTINCT portfolio_date FROM sbi_portfolio ORDER BY portfolio_date DESC LIMIT 5');
    console.log('\nPortfolio dates:');
    dates.rows.forEach(r => console.log(`  - ${r.portfolio_date}`));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkSBI();
