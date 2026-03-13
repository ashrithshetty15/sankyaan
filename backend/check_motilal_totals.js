import db from './src/db.js';

async function checkMotilalTotals() {
  try {
    console.log('🔍 Checking Motilal Oswal fund percentage totals...\n');

    // Get total percentages for each Motilal fund
    const result = await db.query(`
      SELECT
        fund_name,
        COUNT(*) as holdings_count,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_house = 'Motilal Oswal'
      GROUP BY fund_name
      ORDER BY total_pct DESC
      LIMIT 20
    `);

    console.log('Sample fund totals (top 20):');
    console.log('─'.repeat(90));

    result.rows.forEach(row => {
      const total = parseFloat(row.total_pct);
      console.log(`${row.fund_name.padEnd(60)} ${total.toFixed(4).padStart(10)}% (${row.holdings_count.toString().padStart(3)} holdings)`);
    });

    console.log('─'.repeat(90));

    // Sample a few records to check format
    console.log('\n📋 Sample holdings to verify percentage format:');
    const sample = await db.query(`
      SELECT fund_name, instrument_name, percent_nav
      FROM mutualfund_portfolio
      WHERE fund_house = 'Motilal Oswal'
      ORDER BY percent_nav DESC
      LIMIT 5
    `);
    sample.rows.forEach(r => {
      console.log(`  ${r.instrument_name}: ${r.percent_nav} (${r.fund_name.substring(0, 40)}...)`);
    });

    console.log('\n💡 Analysis:');
    console.log('  If values are < 5, they are likely in decimal format (need to multiply by 100)');
    console.log('  If values are 99-101, they are already in percentage format');

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkMotilalTotals();
