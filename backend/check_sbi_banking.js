import db from './src/db.js';

async function checkSBIBanking() {
  try {
    const fundName = 'SBI Banking And Financial Services Fund';

    console.log(`🔍 Checking: ${fundName}\n`);

    // Check source data
    const sourceData = await db.query(`
      SELECT instrument_name, pct_to_nav, market_value_lakh, quantity
      FROM sbi_portfolio
      WHERE fund_name = $1
      ORDER BY pct_to_nav DESC NULLS LAST
      LIMIT 10
    `, [fundName]);

    console.log('Top 10 holdings (from source):');
    let totalPct = 0;
    sourceData.rows.forEach(row => {
      const pct = parseFloat(row.pct_to_nav) || 0;
      totalPct += pct;
      console.log(`  ${row.instrument_name.padEnd(40)} ${pct.toFixed(2).padStart(8)}% (MV: ${row.market_value_lakh})`);
    });
    console.log(`\nTop 10 total: ${totalPct.toFixed(2)}%`);

    // Check all totals
    const allData = await db.query(`
      SELECT SUM(pct_to_nav::numeric) as total, COUNT(*) as count
      FROM sbi_portfolio
      WHERE fund_name = $1
    `, [fundName]);

    console.log(`\nAll ${allData.rows[0].count} holdings total: ${parseFloat(allData.rows[0].total).toFixed(2)}%`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

checkSBIBanking();
