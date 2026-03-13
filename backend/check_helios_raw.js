import db from './src/db.js';

async function checkRawData() {
  try {
    // Check if helios_portfolio table still exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'helios_portfolio'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  helios_portfolio table no longer exists (it was migrated)');
      console.log('\nChecking unified table data instead...\n');

      const result = await db.query(`
        SELECT fund_name, instrument_name, percent_nav, market_value_lacs
        FROM mutualfund_portfolio
        WHERE fund_house = 'Helios' AND fund_name LIKE '%Balanced%'
        ORDER BY CAST(percent_nav AS DECIMAL) DESC
        LIMIT 15
      `);

      console.log('Top 15 holdings by percentage:');
      let total = 0;
      result.rows.forEach((row, idx) => {
        const pct = parseFloat(row.percent_nav);
        total += pct;
        console.log(`${(idx+1).toString().padStart(2)}. ${row.instrument_name.substring(0, 40).padEnd(40)} ${pct.toFixed(2).padStart(6)}%`);
      });
      console.log(`\nSum of top 15: ${total.toFixed(2)}%`);

    } else {
      const result = await db.query(`
        SELECT fund_name, instrument_name, pct_to_nav, market_value_lakh
        FROM helios_portfolio
        WHERE fund_name LIKE '%Balanced%'
        LIMIT 10
      `);

      console.log('Raw Helios data:');
      console.log(JSON.stringify(result.rows, null, 2));
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkRawData();
