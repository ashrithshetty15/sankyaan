import db from './src/db.js';

async function checkSectorFundPE() {
  try {
    // Check an IT fund (should have higher PE around 28.3)
    const itFund = 'HDFC Banking Financial Services Fund';

    const holdings = await db.query(`
      SELECT
        instrument_name,
        industry_rating,
        pe_ratio,
        percent_nav,
        CAST(pe_ratio AS DECIMAL) * CAST(percent_nav AS DECIMAL) as weighted_contribution
      FROM mutualfund_portfolio
      WHERE fund_name = $1
      AND percent_nav IS NOT NULL
      ORDER BY percent_nav DESC
      LIMIT 20
    `, [itFund]);

    console.log(`\n📊 Top holdings from ${itFund}:`);
    console.log('─'.repeat(110));
    let totalPEContribution = 0;
    let totalWeight = 0;

    holdings.rows.forEach(row => {
      const pct = parseFloat(row.percent_nav) || 0;
      const pe = parseFloat(row.pe_ratio) || 0;
      totalPEContribution += parseFloat(row.weighted_contribution) || 0;
      totalWeight += pct;
      console.log(`${row.instrument_name.padEnd(40)} | ${(row.industry_rating || 'N/A').padEnd(25)} | PE: ${pe.toFixed(2).padStart(6)} | %: ${pct.toFixed(2).padStart(6)} | Contrib: ${(parseFloat(row.weighted_contribution) || 0).toFixed(2)}`);
    });

    const weightedPE = totalPEContribution / totalWeight;
    console.log('\n💡 Calculated weighted PE (top 20 holdings): ' + weightedPE.toFixed(2));

    // Calculate for all holdings
    const allHoldings = await db.query(`
      SELECT
        SUM(CAST(pe_ratio AS DECIMAL) * CAST(percent_nav AS DECIMAL)) / SUM(CAST(percent_nav AS DECIMAL)) as weighted_pe,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_name = $1
      AND percent_nav IS NOT NULL
      AND pe_ratio IS NOT NULL
    `, [itFund]);

    console.log(`💡 Calculated weighted PE (all holdings): ${parseFloat(allHoldings.rows[0].weighted_pe).toFixed(2)}`);
    console.log(`   Total allocation covered: ${parseFloat(allHoldings.rows[0].total_pct).toFixed(2)}%`);

    // Check industry distribution
    const industries = await db.query(`
      SELECT
        industry_rating,
        AVG(CAST(pe_ratio AS DECIMAL)) as avg_pe,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct,
        COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_name = $1
      AND percent_nav IS NOT NULL
      GROUP BY industry_rating
      ORDER BY total_pct DESC
    `, [itFund]);

    console.log(`\n📈 Industry breakdown for ${itFund}:`);
    console.log('─'.repeat(80));
    industries.rows.forEach(row => {
      console.log(`${(row.industry_rating || 'Unknown').padEnd(35)} | Avg PE: ${parseFloat(row.avg_pe).toFixed(2).padStart(6)} | %: ${parseFloat(row.total_pct).toFixed(2).padStart(6)} | Holdings: ${row.count}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

checkSectorFundPE();
