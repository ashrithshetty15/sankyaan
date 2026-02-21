import db from './src/db.js';

async function checkSBITotals() {
  try {
    console.log('🔍 Checking SBI fund percentage totals...\n');

    // Get total percentages for each SBI fund
    const result = await db.query(`
      SELECT
        fund_name,
        COUNT(*) as holdings_count,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_house = 'SBI'
      GROUP BY fund_name
      ORDER BY total_pct DESC
    `);

    console.log('Fund totals:');
    console.log('─'.repeat(90));

    let needsNormalization = [];
    let correctRange = [];

    result.rows.forEach(row => {
      const total = parseFloat(row.total_pct);
      const status = (total >= 99 && total <= 101) ? '✓' : '⚠️';

      console.log(`${status} ${row.fund_name.padEnd(60)} ${total.toFixed(2).padStart(8)}% (${row.holdings_count.toString().padStart(3)} holdings)`);

      if (total < 99 || total > 101) {
        needsNormalization.push({
          fund_name: row.fund_name,
          total: total,
          count: row.holdings_count
        });
      } else {
        correctRange.push(row.fund_name);
      }
    });

    console.log('─'.repeat(90));
    console.log(`Total funds checked: ${result.rows.length}`);
    console.log(`Funds with correct totals (99-101%): ${correctRange.length}`);
    console.log(`Funds needing normalization: ${needsNormalization.length}`);

    if (needsNormalization.length > 0) {
      console.log('\n⚠️  Funds with percentage issues:');
      needsNormalization.slice(0, 10).forEach(f => {
        console.log(`  - ${f.fund_name}: ${f.total.toFixed(2)}%`);
      });
      if (needsNormalization.length > 10) {
        console.log(`  ... and ${needsNormalization.length - 10} more`);
      }
    } else {
      console.log('\n✓ All SBI funds have correct percentage totals!');
    }

    // Sample a few records to check format
    console.log('\n📋 Sample holdings to verify percentage format:');
    const sample = await db.query(`
      SELECT fund_name, instrument_name, percent_nav
      FROM mutualfund_portfolio
      WHERE fund_house = 'SBI'
      ORDER BY percent_nav DESC
      LIMIT 5
    `);
    sample.rows.forEach(r => {
      console.log(`  ${r.instrument_name}: ${r.percent_nav}% (${r.fund_name})`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkSBITotals();
