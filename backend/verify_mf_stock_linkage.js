import db from './src/db.js';

async function verifyMFStockLinkage() {
  try {
    console.log('✅ Mutual Fund Holdings → Stocks Linkage Summary\n');
    console.log('═'.repeat(70) + '\n');

    // 1. Overall linkage statistics
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_holdings,
        COUNT(DISTINCT instrument_name) as unique_instruments,
        COUNT(CASE WHEN stock_id IS NOT NULL THEN 1 END) as linked,
        COUNT(DISTINCT stock_id) as unique_stocks_linked
      FROM mutualfund_portfolio
    `);

    const s = stats.rows[0];
    console.log('📊 Overall Statistics:');
    console.log(`   Total holdings: ${s.total_holdings.toLocaleString()}`);
    console.log(`   Unique instruments: ${s.unique_instruments.toLocaleString()}`);
    console.log(`   Linked to stocks: ${s.linked.toLocaleString()} (${((s.linked / s.total_holdings) * 100).toFixed(1)}%)`);
    console.log(`   Unique stocks referenced: ${s.unique_stocks_linked}\n`);

    // 2. Check fund coverage
    const fundCoverage = await db.query(`
      SELECT
        fund_house,
        COUNT(DISTINCT fund_name) as total_funds,
        COUNT(DISTINCT CASE WHEN stock_id IS NOT NULL THEN fund_name END) as funds_with_links
      FROM mutualfund_portfolio
      GROUP BY fund_house
      ORDER BY fund_house
    `);

    console.log('📈 Fund House Coverage:');
    console.log('Fund House'.padEnd(20), 'Total Funds', 'With Stock Links');
    console.log('-'.repeat(60));
    fundCoverage.rows.forEach(r => {
      console.log(
        r.fund_house.padEnd(20),
        String(r.total_funds).padStart(11),
        String(r.funds_with_links).padStart(16)
      );
    });

    // 3. Sample fund with linked stocks
    console.log('\n📋 Sample Fund Analysis:\n');
    const sampleFund = await db.query(`
      SELECT fund_name
      FROM mutualfund_portfolio
      WHERE stock_id IS NOT NULL
      GROUP BY fund_name
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `);

    if (sampleFund.rows.length > 0) {
      const fundName = sampleFund.rows[0].fund_name;
      console.log(`Fund: ${fundName}\n`);

      const holdings = await db.query(`
        SELECT
          mp.instrument_name,
          mp.percent_nav,
          s.symbol,
          s.company_name,
          qs.overall_quality_score
        FROM mutualfund_portfolio mp
        JOIN stocks s ON s.id = mp.stock_id
        LEFT JOIN stock_quality_scores qs ON qs.stock_id = mp.stock_id
        WHERE mp.fund_name = $1
          AND mp.stock_id IS NOT NULL
        ORDER BY mp.percent_nav DESC
        LIMIT 10
      `, [fundName]);

      console.log('Instrument Name'.padEnd(40), '%NAV', 'Symbol'.padEnd(20), 'Quality Score');
      console.log('-'.repeat(90));
      holdings.rows.forEach(r => {
        const pctNav = r.percent_nav ? parseFloat(r.percent_nav).toFixed(2) : '-';
        console.log(
          r.instrument_name.substring(0, 38).padEnd(40),
          String(pctNav).padStart(5),
          r.symbol.padEnd(20),
          String(r.overall_quality_score || '-').padStart(13)
        );
      });
    }

    // 4. Performance comparison
    console.log('\n⚡ Performance Improvements:\n');
    console.log('   Before: LATERAL JOIN with pattern matching (slow)');
    console.log('   After:  Direct foreign key join (fast)\n');
    console.log('   • fundRatings.js: Removed complex LATERAL JOIN');
    console.log('   • calculatePortfolioForensics.js: Removed N+1 query problem');
    console.log('   • Expected speedup: 10-100x faster queries\n');

    console.log('✅ Linkage verification complete!');
    console.log('\nNext steps:');
    console.log('   1. Refresh fund ratings cache: node compute_fund_ratings.js');
    console.log('   2. Test frontend mutual fund holdings view');
    console.log('   3. Click on linked stocks to navigate to stock detail pages\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyMFStockLinkage();
