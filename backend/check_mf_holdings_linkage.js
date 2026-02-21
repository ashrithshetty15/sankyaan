import db from './src/db.js';

async function checkMFHoldingsLinkage() {
  try {
    console.log('📊 Analyzing Mutual Fund Holdings Linkage\n');

    // 1. Overall statistics
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_holdings,
        COUNT(DISTINCT instrument_name) as unique_instruments,
        COUNT(DISTINCT isin) as unique_isins,
        COUNT(CASE WHEN isin IS NOT NULL THEN 1 END) as with_isin,
        COUNT(CASE WHEN isin IS NULL THEN 1 END) as without_isin
      FROM mutualfund_portfolio
      WHERE industry_rating IS NOT NULL
    `);

    const s = stats.rows[0];
    console.log('📈 Overall Statistics:');
    console.log(`   Total holdings: ${s.total_holdings}`);
    console.log(`   Unique instruments: ${s.unique_instruments}`);
    console.log(`   Unique ISINs: ${s.unique_isins}`);
    console.log(`   With ISIN: ${s.with_isin} (${((s.with_isin / s.total_holdings) * 100).toFixed(1)}%)`);
    console.log(`   Without ISIN: ${s.without_isin} (${((s.without_isin / s.total_holdings) * 100).toFixed(1)}%)\n`);

    // 2. Check how many holdings have matching ISIN in stocks table
    const matchableByIsin = await db.query(`
      SELECT COUNT(DISTINCT mfp.isin) as count
      FROM mutualfund_portfolio mfp
      WHERE mfp.isin IS NOT NULL
        AND mfp.isin IN (SELECT isin FROM stocks WHERE isin IS NOT NULL)
    `);

    console.log('🔗 Linkage Potential:');
    console.log(`   Holdings with matching ISIN in stocks table: ${matchableByIsin.rows[0].count}\n`);

    // 3. Sample of holdings with matching ISIN
    const samples = await db.query(`
      SELECT DISTINCT ON (mfp.isin)
        mfp.instrument_name,
        mfp.isin,
        s.symbol,
        s.company_name
      FROM mutualfund_portfolio mfp
      JOIN stocks s ON s.isin = mfp.isin
      WHERE mfp.isin IS NOT NULL
      LIMIT 15
    `);

    if (samples.rows.length > 0) {
      console.log('📋 Sample Holdings Matching by ISIN:');
      console.log('Instrument Name'.padEnd(40), 'ISIN'.padEnd(15), 'Symbol'.padEnd(20), 'Stock Name');
      console.log('-'.repeat(120));
      samples.rows.forEach(r => {
        console.log(
          r.instrument_name.substring(0, 38).padEnd(40),
          r.isin.padEnd(15),
          r.symbol.padEnd(20),
          r.company_name.substring(0, 35)
        );
      });
      console.log();
    }

    // 4. Check stocks table ISIN coverage
    const stocksIsinCoverage = await db.query(`
      SELECT
        COUNT(*) as total_stocks,
        COUNT(CASE WHEN isin IS NOT NULL THEN 1 END) as with_isin,
        COUNT(CASE WHEN isin IS NULL THEN 1 END) as without_isin
      FROM stocks
    `);

    const sc = stocksIsinCoverage.rows[0];
    console.log('📊 Stocks Table ISIN Coverage:');
    console.log(`   Total stocks: ${sc.total_stocks}`);
    console.log(`   With ISIN: ${sc.with_isin} (${((sc.with_isin / sc.total_stocks) * 100).toFixed(1)}%)`);
    console.log(`   Without ISIN: ${sc.without_isin} (${((sc.without_isin / sc.total_stocks) * 100).toFixed(1)}%)\n`);

    // 5. Check if there are holdings with ISIN not in stocks table
    const missingInStocks = await db.query(`
      SELECT COUNT(DISTINCT mfp.isin) as count
      FROM mutualfund_portfolio mfp
      WHERE mfp.isin IS NOT NULL
        AND mfp.isin NOT IN (SELECT isin FROM stocks WHERE isin IS NOT NULL)
    `);

    console.log('⚠️  Holdings with ISIN NOT in stocks table: ' + missingInStocks.rows[0].count);

    if (parseInt(missingInStocks.rows[0].count) > 0) {
      const sampleMissing = await db.query(`
        SELECT DISTINCT
          mfp.instrument_name,
          mfp.isin
        FROM mutualfund_portfolio mfp
        WHERE mfp.isin IS NOT NULL
          AND mfp.isin NOT IN (SELECT isin FROM stocks WHERE isin IS NOT NULL)
        LIMIT 15
      `);

      console.log('\n📋 Sample Holdings NOT in Stocks Table:');
      console.log('Instrument Name'.padEnd(50), 'ISIN');
      console.log('-'.repeat(70));
      sampleMissing.rows.forEach(r => {
        console.log(r.instrument_name.substring(0, 48).padEnd(50), r.isin);
      });
    }

    // 6. Check current table structure
    console.log('\n📋 Checking if stock_id column exists in mutualfund_portfolio...');
    const hasStockId = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'mutualfund_portfolio'
        AND column_name = 'stock_id'
    `);

    if (hasStockId.rows.length === 0) {
      console.log('❌ stock_id column does NOT exist in mutualfund_portfolio table');
      console.log('   We need to add this column to enable linking\n');
    } else {
      console.log('✅ stock_id column exists\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMFHoldingsLinkage();
