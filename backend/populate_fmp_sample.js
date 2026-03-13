import db from './src/db.js';
import { fetchAndStoreCompleteStockData } from './src/fmpService.js';

/**
 * Populate FMP data for a sample of stocks (for testing)
 *
 * Usage:
 *   node populate_fmp_sample.js              // Fetch 10 random stocks
 *   node populate_fmp_sample.js 50           // Fetch 50 random stocks
 *   node populate_fmp_sample.js TCS INFY     // Fetch specific symbols
 */

async function populateFMPSample() {
  console.log('\n🧪 FMP Sample Data Population\n');

  try {
    let symbols = [];

    // Get symbols from command line arguments or random sample
    if (process.argv.length > 2) {
      // Check if first arg is a number (sample size)
      const firstArg = process.argv[2];
      if (!isNaN(firstArg)) {
        const sampleSize = parseInt(firstArg);
        console.log(`📋 Fetching ${sampleSize} random NSE symbols...\n`);

        const result = await db.query(`
          SELECT symbol, company_name
          FROM nse_symbol_map
          ORDER BY RANDOM()
          LIMIT $1
        `, [sampleSize]);

        symbols = result.rows;
      } else {
        // Specific symbols provided
        const requestedSymbols = process.argv.slice(2);
        console.log(`📋 Fetching specific symbols: ${requestedSymbols.join(', ')}\n`);

        for (const sym of requestedSymbols) {
          const result = await db.query(
            'SELECT symbol, company_name FROM nse_symbol_map WHERE symbol = $1',
            [sym]
          );

          if (result.rows.length > 0) {
            symbols.push(result.rows[0]);
          } else {
            console.log(`⚠️  Symbol ${sym} not found in NSE list`);
          }
        }
      }
    } else {
      // Default: 10 random stocks
      console.log('📋 Fetching 10 random NSE symbols...\n');

      const result = await db.query(`
        SELECT symbol, company_name
        FROM nse_symbol_map
        ORDER BY RANDOM()
        LIMIT 10
      `);

      symbols = result.rows;
    }

    if (symbols.length === 0) {
      console.log('❌ No symbols to process');
      process.exit(1);
    }

    console.log(`Processing ${symbols.length} symbol(s):\n`);

    // Statistics
    let successCount = 0;
    let failureCount = 0;

    // Process each symbol
    for (let i = 0; i < symbols.length; i++) {
      const { symbol, company_name } = symbols[i];

      console.log(`\n[${i + 1}/${symbols.length}] ${symbol} - ${company_name}`);
      console.log('─'.repeat(60));

      try {
        const result = await fetchAndStoreCompleteStockData(symbol);

        if (result.success) {
          successCount++;
          console.log(`✅ Success!`);
          console.log(`   Stock ID: ${result.stockId}`);
          if (result.hasDividends) console.log(`   📊 Dividend data available`);
          if (result.hasSplits) console.log(`   ✂️  Split data available`);
        } else {
          failureCount++;
          console.log(`❌ Failed: ${result.error}`);
        }

      } catch (error) {
        failureCount++;
        console.log(`❌ Error: ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total:    ${symbols.length}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed:  ${failureCount}`);
    console.log('='.repeat(60) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

populateFMPSample();
