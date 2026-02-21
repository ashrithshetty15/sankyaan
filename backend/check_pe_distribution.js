import db from './src/db.js';

async function checkPEDistribution() {
  try {
    console.log('🔍 Checking PE ratio distribution...\n');

    // Check PE ratios for a sample fund
    const sampleFund = 'HDFC Arbitrage Fund';

    const holdings = await db.query(`
      SELECT
        instrument_name,
        industry_rating,
        pe_ratio,
        percent_nav
      FROM mutualfund_portfolio
      WHERE fund_name = $1
      ORDER BY percent_nav DESC
      LIMIT 20
    `, [sampleFund]);

    console.log(`Sample holdings from ${sampleFund}:`);
    console.log('─'.repeat(100));
    holdings.rows.forEach(row => {
      console.log(`${row.instrument_name.padEnd(40)} | ${(row.industry_rating || 'N/A').padEnd(25)} | PE: ${row.pe_ratio || 'NULL'} | %: ${row.percent_nav}`);
    });

    // Check distinct PE ratios in the database
    const distinctPE = await db.query(`
      SELECT
        pe_ratio,
        COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE pe_ratio IS NOT NULL
      GROUP BY pe_ratio
      ORDER BY count DESC
      LIMIT 20
    `);

    console.log('\n📊 PE Ratio Distribution:');
    console.log('─'.repeat(50));
    distinctPE.rows.forEach(row => {
      console.log(`PE ${row.pe_ratio}: ${row.count} holdings`);
    });

    // Check how many records have each PE value
    const peStats = await db.query(`
      SELECT
        COUNT(CASE WHEN pe_ratio IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN pe_ratio = 20 THEN 1 END) as default_count,
        COUNT(CASE WHEN pe_ratio != 20 AND pe_ratio IS NOT NULL THEN 1 END) as custom_count,
        COUNT(*) as total
      FROM mutualfund_portfolio
    `);

    console.log('\n📈 PE Ratio Statistics:');
    console.log('─'.repeat(50));
    const stats = peStats.rows[0];
    console.log(`NULL PE ratios: ${stats.null_count}`);
    console.log(`Default (20.0): ${stats.default_count}`);
    console.log(`Custom PE: ${stats.custom_count}`);
    console.log(`Total records: ${stats.total}`);

    // Calculate weighted PE for the sample fund
    const weightedPE = await db.query(`
      SELECT
        SUM(CAST(pe_ratio AS DECIMAL) * CAST(percent_nav AS DECIMAL)) / SUM(CAST(percent_nav AS DECIMAL)) as weighted_pe
      FROM mutualfund_portfolio
      WHERE fund_name = $1 AND pe_ratio IS NOT NULL
    `, [sampleFund]);

    console.log(`\n💡 Calculated weighted PE for ${sampleFund}: ${parseFloat(weightedPE.rows[0].weighted_pe).toFixed(2)}`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

checkPEDistribution();
