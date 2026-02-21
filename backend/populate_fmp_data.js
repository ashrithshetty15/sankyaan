import db from './src/db.js';
import { fetchAndStoreCompleteStockData } from './src/fmpService.js';

/**
 * Populate database with FMP data for all NSE stocks
 *
 * This script:
 * - Fetches all NSE symbols from nse_symbol_map
 * - For each symbol, fetches complete data from FMP API
 * - Stores data in database (stocks, stock_prices, stock_fundamentals)
 * - Processes in batches to avoid overwhelming the API
 * - Provides progress tracking and error handling
 */

async function populateFMPData() {
  console.log('\n🚀 Starting FMP Data Population\n');
  console.log('=' .repeat(60));

  try {
    // Get all NSE symbols
    console.log('\n📋 Fetching NSE symbol list...');
    const symbolsResult = await db.query(`
      SELECT symbol, company_name, isin
      FROM nse_symbol_map
      ORDER BY symbol
    `);

    const symbols = symbolsResult.rows;
    console.log(`✅ Found ${symbols.length} NSE symbols\n`);

    // Configuration
    const BATCH_SIZE = 50; // Process 50 stocks at a time
    const DELAY_BETWEEN_BATCHES = 10000; // 10 seconds between batches

    // Statistics
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Process in batches
    const totalBatches = Math.ceil(symbols.length / BATCH_SIZE);

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const batchStart = batchNum * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, symbols.length);
      const batch = symbols.slice(batchStart, batchEnd);

      console.log(`\n📦 Processing Batch ${batchNum + 1}/${totalBatches} (Symbols ${batchStart + 1}-${batchEnd})`);
      console.log('─'.repeat(60));

      // Process each symbol in the batch
      for (let i = 0; i < batch.length; i++) {
        const { symbol, company_name } = batch[i];
        const progress = batchStart + i + 1;

        console.log(`\n[${progress}/${symbols.length}] ${symbol} - ${company_name}`);

        try {
          // Check if stock already exists with recent data
          const existingStock = await db.query(
            `SELECT s.id, s.updated_at,
              (SELECT COUNT(*) FROM stock_prices WHERE stock_id = s.id) as price_count,
              (SELECT COUNT(*) FROM stock_fundamentals WHERE stock_id = s.id) as fundamentals_count
             FROM stocks s
             WHERE s.symbol = $1`,
            [symbol]
          );

          // Skip if stock has recent data (updated within last 7 days)
          if (existingStock.rows.length > 0) {
            const stock = existingStock.rows[0];
            const lastUpdate = new Date(stock.updated_at);
            const daysSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);

            if (daysSinceUpdate < 7 && stock.price_count > 0 && stock.fundamentals_count > 0) {
              console.log(`   ⏭️  Skipped (data from ${daysSinceUpdate.toFixed(1)} days ago)`);
              skippedCount++;
              continue;
            }
          }

          // Fetch and store complete data from FMP
          const result = await fetchAndStoreCompleteStockData(symbol);

          if (result.success) {
            successCount++;
            console.log(`   ✅ Success (Stock ID: ${result.stockId})`);
          } else {
            failureCount++;
            errors.push({ symbol, company_name, error: result.error });
            console.log(`   ❌ Failed: ${result.error}`);
          }

        } catch (error) {
          failureCount++;
          errors.push({ symbol, company_name, error: error.message });
          console.log(`   ❌ Error: ${error.message}`);
        }
      }

      // Delay between batches (except for last batch)
      if (batchNum < totalBatches - 1) {
        console.log(`\n⏸️  Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    // Print summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 POPULATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Symbols:    ${symbols.length}`);
    console.log(`✅ Success:       ${successCount} (${((successCount / symbols.length) * 100).toFixed(1)}%)`);
    console.log(`⏭️  Skipped:       ${skippedCount} (${((skippedCount / symbols.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed:        ${failureCount} (${((failureCount / symbols.length) * 100).toFixed(1)}%)`);
    console.log('='.repeat(60));

    // Print errors if any
    if (errors.length > 0) {
      console.log(`\n\n❌ FAILED SYMBOLS (${errors.length}):`);
      console.log('─'.repeat(60));
      errors.forEach((err, index) => {
        console.log(`${index + 1}. ${err.symbol} - ${err.company_name}`);
        console.log(`   Error: ${err.error}\n`);
      });
    }

    console.log('\n✅ FMP Data Population Complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the population
populateFMPData();
