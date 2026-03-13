import db from './src/db.js';

async function populateStocksIsin() {
  try {
    console.log('📊 Populating ISIN in stocks table from nse_symbol_map\n');

    // 1. Check current ISIN coverage in nse_symbol_map
    const nseMapStats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN isin IS NOT NULL AND isin != '' THEN 1 END) as with_isin
      FROM nse_symbol_map
    `);

    console.log('📈 NSE Symbol Map ISIN Coverage:');
    console.log(`   Total records: ${nseMapStats.rows[0].total}`);
    console.log(`   With ISIN: ${nseMapStats.rows[0].with_isin}\n`);

    // 2. Check how many stocks can be matched
    const matchable = await db.query(`
      SELECT COUNT(*) as count
      FROM stocks s
      JOIN nse_symbol_map nsm ON REPLACE(s.symbol, '.NS', '') = nsm.nse_symbol
      WHERE nsm.isin IS NOT NULL AND nsm.isin != ''
    `);

    console.log(`🔗 Stocks that can be matched: ${matchable.rows[0].count}\n`);

    // 3. Sample of matches
    const samples = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        s.isin as current_isin,
        nsm.isin as nse_map_isin,
        nsm.company_name as nse_company_name
      FROM stocks s
      JOIN nse_symbol_map nsm ON REPLACE(s.symbol, '.NS', '') = nsm.nse_symbol
      WHERE nsm.isin IS NOT NULL AND nsm.isin != ''
      LIMIT 10
    `);

    console.log('📋 Sample Matches:');
    console.log('Symbol'.padEnd(20), 'Stock ISIN'.padEnd(15), 'NSE Map ISIN'.padEnd(15), 'Company');
    console.log('-'.repeat(90));
    samples.rows.forEach(r => {
      console.log(
        r.symbol.padEnd(20),
        (r.current_isin || 'NULL').padEnd(15),
        (r.nse_map_isin || 'NULL').padEnd(15),
        r.company_name.substring(0, 35)
      );
    });

    console.log('\n🔄 Starting ISIN population...\n');

    // 4. Update stocks table with ISIN from nse_symbol_map
    const updateResult = await db.query(`
      UPDATE stocks s
      SET isin = nsm.isin
      FROM nse_symbol_map nsm
      WHERE REPLACE(s.symbol, '.NS', '') = nsm.nse_symbol
        AND nsm.isin IS NOT NULL
        AND nsm.isin != ''
        AND (s.isin IS NULL OR s.isin = '')
    `);

    console.log(`✅ Updated ${updateResult.rowCount} stocks with ISIN\n`);

    // 5. Verify after update
    const afterStats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN isin IS NOT NULL AND isin != '' THEN 1 END) as with_isin
      FROM stocks
    `);

    console.log('📊 Stocks Table ISIN Coverage (After Update):');
    console.log(`   Total stocks: ${afterStats.rows[0].total}`);
    console.log(`   With ISIN: ${afterStats.rows[0].with_isin} (${((afterStats.rows[0].with_isin / afterStats.rows[0].total) * 100).toFixed(1)}%)\n`);

    // 6. Check how many MF holdings can now be linked
    const linkable = await db.query(`
      SELECT COUNT(DISTINCT mfp.isin) as count
      FROM mutualfund_portfolio mfp
      WHERE mfp.isin IS NOT NULL
        AND mfp.isin IN (SELECT isin FROM stocks WHERE isin IS NOT NULL)
    `);

    console.log(`🔗 MF Holdings that can now be linked: ${linkable.rows[0].count} unique ISINs\n`);

    // 7. Sample linkable holdings
    const linkableSamples = await db.query(`
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

    if (linkableSamples.rows.length > 0) {
      console.log('📋 Sample MF Holdings Ready for Linking:');
      console.log('Instrument Name'.padEnd(40), 'ISIN'.padEnd(15), 'Symbol'.padEnd(20), 'Stock Name');
      console.log('-'.repeat(120));
      linkableSamples.rows.forEach(r => {
        console.log(
          r.instrument_name.substring(0, 38).padEnd(40),
          r.isin.padEnd(15),
          r.symbol.padEnd(20),
          r.company_name.substring(0, 35)
        );
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

populateStocksIsin();
