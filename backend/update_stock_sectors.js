import YahooFinance from 'yahoo-finance2';
import db from './src/db.js';

const yahooFinance = new YahooFinance();

async function updateStockSectors() {
  try {
    console.log('🔄 Updating sector and industry data for all stocks...\n');

    // Get all stocks
    const result = await db.query('SELECT id, symbol FROM stocks ORDER BY symbol');
    const stocks = result.rows;

    console.log(`Found ${stocks.length} stocks to process\n`);

    let updated = 0;
    let failed = 0;
    let noData = 0;

    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];

      try {
        // Use quoteSummary for more detailed information
        const data = await yahooFinance.quoteSummary(stock.symbol, {
          modules: ['assetProfile', 'summaryDetail']
        });

        const sector = data.assetProfile?.sector || null;
        const industry = data.assetProfile?.industry || null;

        if (sector || industry) {
          await db.query(
            'UPDATE stocks SET sector = $1, industry = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [sector, industry, stock.id]
          );

          console.log(`✅ [${i + 1}/${stocks.length}] ${stock.symbol}: ${sector || 'N/A'} / ${industry || 'N/A'}`);
          updated++;
        } else {
          console.log(`⚠️  [${i + 1}/${stocks.length}] ${stock.symbol}: No sector/industry data available`);
          noData++;
        }

        // Rate limiting - wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`❌ [${i + 1}/${stocks.length}] ${stock.symbol}: ${error.message}`);
        failed++;

        // Wait longer after errors
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Progress update every 50 stocks
      if ((i + 1) % 50 === 0) {
        console.log(`\n📊 Progress: ${i + 1}/${stocks.length} (${Math.round((i + 1) / stocks.length * 100)}%)`);
        console.log(`   Updated: ${updated}, No Data: ${noData}, Failed: ${failed}\n`);
      }
    }

    console.log('\n✅ Sector update complete!');
    console.log(`📊 Summary:`);
    console.log(`   Total stocks: ${stocks.length}`);
    console.log(`   Updated with sector/industry: ${updated}`);
    console.log(`   No data available: ${noData}`);
    console.log(`   Failed: ${failed}`);

    // Check final statistics
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(sector) as with_sector,
        COUNT(industry) as with_industry,
        COUNT(*) - COUNT(sector) as null_sector
      FROM stocks
    `);

    console.log(`\n📈 Database Statistics:`);
    console.log(`   Total stocks: ${stats.rows[0].total}`);
    console.log(`   With sector: ${stats.rows[0].with_sector}`);
    console.log(`   With industry: ${stats.rows[0].with_industry}`);
    console.log(`   NULL sector: ${stats.rows[0].null_sector}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateStockSectors();
