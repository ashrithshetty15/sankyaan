import db from './src/db.js';

async function checkNipponTotals() {
  try {
    console.log('🔍 Checking Nippon fund percentage totals...\n');

    // Get total percentages for each Nippon fund
    const result = await db.query(`
      SELECT
        fund_name,
        COUNT(*) as holdings_count,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_house = 'Nippon'
      GROUP BY fund_name
      ORDER BY total_pct DESC
    `);

    console.log('Fund totals:');
    console.log('─'.repeat(80));

    let needsNormalization = [];

    result.rows.forEach(row => {
      const total = parseFloat(row.total_pct);
      const status = (total >= 99 && total <= 101) ? '✓' : '⚠️';
      console.log(`${status} ${row.fund_name.padEnd(50)} ${total.toFixed(2).padStart(8)}% (${row.holdings_count} holdings)`);

      if (total < 99 || total > 101) {
        needsNormalization.push({
          fund_name: row.fund_name,
          total: total,
          count: row.holdings_count
        });
      }
    });

    console.log('─'.repeat(80));
    console.log(`Total funds checked: ${result.rows.length}`);
    console.log(`Funds needing normalization: ${needsNormalization.length}`);

    if (needsNormalization.length > 0) {
      console.log('\n⚠️  Funds with percentage issues:');
      needsNormalization.forEach(f => {
        console.log(`  - ${f.fund_name}: ${f.total.toFixed(2)}%`);
      });
    } else {
      console.log('\n✓ All Nippon funds have correct percentage totals!');
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkNipponTotals();
