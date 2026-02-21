import db from './src/db.js';

async function fixNipponPercentages() {
  try {
    console.log('🔄 Converting Nippon percentages from decimal to percentage format...\n');

    // Check current state
    const beforeSample = await db.query(`
      SELECT fund_name, SUM(CAST(percent_nav AS DECIMAL)) as total
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon'
      GROUP BY fund_name
      ORDER BY total DESC
      LIMIT 5
    `);

    console.log('Before conversion (sample):');
    beforeSample.rows.forEach(row => {
      console.log(`  ${row.fund_name}: ${parseFloat(row.total).toFixed(4)}%`);
    });

    // Multiply all Nippon percentages by 100
    console.log('\n📊 Multiplying all Nippon percentages by 100...');

    const result = await db.query(`
      UPDATE mutualfund_portfolio
      SET percent_nav = CAST(percent_nav AS DECIMAL) * 100
      WHERE fund_house = 'Nippon'
    `);

    console.log(`✅ Updated ${result.rowCount} records\n`);

    // Verify the results
    const afterSample = await db.query(`
      SELECT fund_name, SUM(CAST(percent_nav AS DECIMAL)) as total
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon'
      GROUP BY fund_name
      ORDER BY total DESC
      LIMIT 5
    `);

    console.log('After conversion (sample):');
    afterSample.rows.forEach(row => {
      console.log(`  ${row.fund_name}: ${parseFloat(row.total).toFixed(2)}%`);
    });

    // Check how many funds are now within acceptable range (99-101%)
    const rangeCheck = await db.query(`
      SELECT
        COUNT(CASE WHEN total >= 99 AND total <= 101 THEN 1 END) as within_range,
        COUNT(*) as total_funds
      FROM (
        SELECT fund_name, SUM(CAST(percent_nav AS DECIMAL)) as total
        FROM mutualfund_portfolio
        WHERE fund_house = 'Nippon'
        GROUP BY fund_name
      ) as fund_totals
    `);

    const within = parseInt(rangeCheck.rows[0].within_range);
    const total = parseInt(rangeCheck.rows[0].total_funds);

    console.log(`\n📈 Funds with correct totals: ${within}/${total}`);

    console.log('\n✨ Conversion complete!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

fixNipponPercentages();
