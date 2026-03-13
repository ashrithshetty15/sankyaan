import db from './src/db.js';

/**
 * Populate nse_symbol_map with all stocks from stocks table
 * This ensures fetch_fmp_fundamentals.js will fetch data for all stocks
 */

async function populateMissingSymbols() {
  try {
    console.log('🔧 Populating nse_symbol_map with all stocks\n');

    // 1. Check current state
    const currentCount = await db.query('SELECT COUNT(*) FROM nse_symbol_map');
    console.log(`Current nse_symbol_map count: ${currentCount.rows[0].count}`);

    const stocksCount = await db.query('SELECT COUNT(*) FROM stocks');
    console.log(`Total stocks in stocks table: ${stocksCount.rows[0].count}\n`);

    // 2. Get stocks that are NOT in nse_symbol_map
    const missingSymbols = await db.query(`
      SELECT s.symbol, s.company_name, s.isin
      FROM stocks s
      WHERE REPLACE(s.symbol, '.NS', '') NOT IN (
        SELECT nse_symbol FROM nse_symbol_map
      )
      ORDER BY s.symbol
    `);

    console.log(`📊 Found ${missingSymbols.rows.length} stocks missing from nse_symbol_map\n`);

    if (missingSymbols.rows.length === 0) {
      console.log('✅ All stocks already in nse_symbol_map');
      process.exit(0);
    }

    // 3. Insert missing symbols into nse_symbol_map
    console.log('📝 Inserting missing symbols...');

    let inserted = 0;
    for (const row of missingSymbols.rows) {
      const symbol = row.symbol;
      // Remove .NS suffix to get NSE symbol
      const nseSymbol = symbol.replace('.NS', '');

      // Generate unique ISIN if not available (ISIN is primary key)
      const isin = row.isin || `GEN${nseSymbol}`;

      try {
        await db.query(`
          INSERT INTO nse_symbol_map (nse_symbol, company_name, isin, loaded_at)
          VALUES ($1, $2, $3, NOW())
        `, [nseSymbol, row.company_name, isin]);
        inserted++;

        if (inserted % 100 === 0) {
          console.log(`  Progress: ${inserted}/${missingSymbols.rows.length}`);
        }
      } catch (error) {
        // Skip duplicates
        if (error.code !== '23505') {
          console.log(`  ⚠️  Failed to insert ${nseSymbol}: ${error.message}`);
        }
      }
    }

    console.log(`✅ Inserted ${inserted} symbols\n`);

    // 4. Verify
    const newCount = await db.query('SELECT COUNT(*) FROM nse_symbol_map');
    console.log(`New nse_symbol_map count: ${newCount.rows[0].count}`);
    console.log(`Added: ${parseInt(newCount.rows[0].count) - parseInt(currentCount.rows[0].count)}\n`);

    console.log('═════════════════════════════════════════════════════════════');
    console.log('✅ COMPLETE');
    console.log('═════════════════════════════════════════════════════════════');
    console.log('\n📊 Next step: Run fetch_fmp_fundamentals.js to fetch data for all stocks');
    console.log('   This will take approximately ' + Math.ceil(missingSymbols.rows.length * 5 / 280) + ' minutes\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

populateMissingSymbols();
