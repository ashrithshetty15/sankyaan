import db from './src/db.js';

async function fixNifty500() {
  try {
    const fundName = 'Nippon India Nifty 500 Equal Weight Index Fund';

    console.log(`🔧 Fixing: ${fundName}\n`);

    // Count total holdings
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon' AND fund_name = $1
    `, [fundName]);

    const totalHoldings = parseInt(countResult.rows[0].total);
    const equalWeight = 100 / totalHoldings;

    console.log(`Total holdings: ${totalHoldings}`);
    console.log(`Equal weight per holding: ${equalWeight.toFixed(4)}%\n`);

    // Set equal weight for all holdings in this fund
    const updateResult = await db.query(`
      UPDATE mutualfund_portfolio
      SET percent_nav = $1
      WHERE fund_house = 'Nippon' AND fund_name = $2
    `, [equalWeight, fundName]);

    console.log(`✅ Updated ${updateResult.rowCount} holdings\n`);

    // Verify
    const verifyResult = await db.query(`
      SELECT
        COUNT(*) as holdings,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon' AND fund_name = $1
    `, [fundName]);

    console.log('Verification:');
    console.log(`  Holdings: ${verifyResult.rows[0].holdings}`);
    console.log(`  Total: ${parseFloat(verifyResult.rows[0].total_pct).toFixed(2)}%`);

    console.log('\n✨ Fixed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

fixNifty500();
