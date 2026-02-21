import db from './src/db.js';

async function normalizeAllFunds() {
  try {
    console.log('🔄 Normalizing portfolio percentages to sum to 100%...\n');

    // Get funds that need normalization (total not between 99% and 101%)
    const fundsResult = await db.query(`
      SELECT fund_house, fund_name, SUM(CAST(percent_nav AS DECIMAL)) as current_total
      FROM mutualfund_portfolio
      GROUP BY fund_house, fund_name
      HAVING SUM(CAST(percent_nav AS DECIMAL)) < 99 OR SUM(CAST(percent_nav AS DECIMAL)) > 101
      ORDER BY current_total DESC
    `);

    console.log(`Found ${fundsResult.rows.length} funds needing normalization\n`);

    let normalized = 0;

    // Normalize each fund to 100%
    for (const row of fundsResult.rows) {
      const fundHouse = row.fund_house;
      const fundName = row.fund_name;
      const currentTotal = parseFloat(row.current_total);
      const scaleFactor = 100 / currentTotal;

      // Update the percentages
      const updateResult = await db.query(`
        UPDATE mutualfund_portfolio
        SET percent_nav = CAST(percent_nav AS DECIMAL) * $1
        WHERE fund_house = $2 AND fund_name = $3
      `, [scaleFactor, fundHouse, fundName]);

      normalized++;

      // Only log the first 10 and last 5 to avoid clutter
      if (normalized <= 10 || normalized > fundsResult.rows.length - 5) {
        console.log(`✓ ${fundHouse} - ${fundName}`);
        console.log(`  ${currentTotal.toFixed(2)}% → 100.00% (${updateResult.rowCount} holdings)\n`);
      } else if (normalized === 11) {
        console.log('  ... normalizing remaining funds ...\n');
      }
    }

    // Verify the results
    const verifyResult = await db.query(`
      SELECT
        fund_house,
        COUNT(CASE WHEN total >= 99 AND total <= 101 THEN 1 END) as within_range,
        COUNT(*) as total_funds
      FROM (
        SELECT fund_house, fund_name, SUM(CAST(percent_nav AS DECIMAL)) as total
        FROM mutualfund_portfolio
        GROUP BY fund_house, fund_name
      ) as fund_totals
      GROUP BY fund_house
      ORDER BY fund_house
    `);

    console.log('📊 Verification Summary:');
    console.log('─'.repeat(60));
    verifyResult.rows.forEach(row => {
      const pct = (parseInt(row.within_range) / parseInt(row.total_funds) * 100).toFixed(1);
      console.log(`${row.fund_house.padEnd(15)}: ${row.within_range.toString().padStart(3)}/${row.total_funds.toString().padStart(3)} funds (${pct}%)`);
    });
    console.log('─'.repeat(60));

    console.log(`\n✨ Normalized ${normalized} funds successfully!`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

normalizeAllFunds();
