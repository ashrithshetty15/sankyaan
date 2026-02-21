import db from './src/db.js';

async function normalizeHelios() {
  try {
    console.log('🔄 Normalizing Helios portfolio percentages...\n');

    // Get the current totals by fund
    const totalsResult = await db.query(`
      SELECT fund_name, SUM(CAST(percent_nav AS DECIMAL)) as current_total
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY fund_name
    `);

    console.log('Current totals:');
    totalsResult.rows.forEach(row => {
      console.log(`  ${row.fund_name}: ${parseFloat(row.current_total).toFixed(2)}%`);
    });

    console.log('\n📊 Normalizing percentages to sum to 100%...\n');

    // Normalize each fund to 100%
    for (const row of totalsResult.rows) {
      const fundName = row.fund_name;
      const currentTotal = parseFloat(row.current_total);
      const scaleFactor = 100 / currentTotal;

      console.log(`  ${fundName}:`);
      console.log(`    Current total: ${currentTotal.toFixed(2)}%`);
      console.log(`    Scale factor: ${scaleFactor.toFixed(4)}`);

      // Update the percentages
      const updateResult = await db.query(`
        UPDATE mutualfund_portfolio
        SET percent_nav = CAST(percent_nav AS DECIMAL) * $1
        WHERE fund_house = 'Helios' AND fund_name = $2
      `, [scaleFactor, fundName]);

      console.log(`    Updated ${updateResult.rowCount} records\n`);
    }

    // Verify the results
    const verifyResult = await db.query(`
      SELECT fund_name, SUM(CAST(percent_nav AS DECIMAL)) as new_total
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY fund_name
    `);

    console.log('After normalization:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.fund_name}: ${parseFloat(row.new_total).toFixed(2)}%`);
    });

    console.log('\n✨ Normalization complete!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

normalizeHelios();
