import db from './src/db.js';
import { scrapeScreenerData, saveScreenerData } from './screener_scraper.js';
import fs from 'fs';

const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds to avoid being blocked
const BATCH_SIZE = 50; // Process 50 stocks then pause
const BATCH_DELAY = 10000; // 10 seconds between batches
const MAX_RETRIES = 2;

async function scrapeAllFundamentals() {
  try {
    console.log('🔄 Scraping fundamental data from Screener.in for all NSE stocks...\n');

    // Get all stocks
    const result = await db.query('SELECT id, symbol FROM stocks ORDER BY symbol');
    const stocks = result.rows;

    console.log(`Found ${stocks.length} stocks to process\n`);

    // Load progress if exists
    let progress = { processed: 0, successful: 0, failed: 0, notFound: 0, failedStocks: [] };
    if (fs.existsSync('scraping_progress.json')) {
      const savedProgress = JSON.parse(fs.readFileSync('scraping_progress.json', 'utf8'));
      progress = savedProgress;
      console.log(`📂 Resuming from previous progress: ${progress.processed}/${stocks.length} stocks processed\n`);
    }

    const startFrom = progress.processed;
    let successful = progress.successful;
    let failed = progress.failed;
    let notFound = progress.notFound;
    const failedStocks = progress.failedStocks || [];

    for (let i = startFrom; i < stocks.length; i++) {
      const stock = stocks[i];
      let retries = 0;
      let success = false;

      while (retries <= MAX_RETRIES && !success) {
        try {
          console.log(`[${i + 1}/${stocks.length}] Scraping ${stock.symbol}...`);

          const data = await scrapeScreenerData(stock.symbol);

          if (!data) {
            console.log(`   ⚠️  Not found on Screener.in\n`);
            notFound++;
            success = true; // Don't retry 404s
          } else {
            // Save to database
            await saveScreenerData(data);

            console.log(`   ✅ Saved: Revenue=${data.revenue ? `₹${(data.revenue / 10000000).toFixed(0)} Cr` : 'N/A'}, ` +
                       `NetProfit=${data.netProfit ? `₹${(data.netProfit / 10000000).toFixed(0)} Cr` : 'N/A'}, ` +
                       `ROE=${data.roe ? `${data.roe.toFixed(1)}%` : 'N/A'}\n`);
            successful++;
            success = true;
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));

        } catch (error) {
          retries++;
          if (retries > MAX_RETRIES) {
            console.log(`   ❌ Failed after ${MAX_RETRIES} retries: ${error.message}\n`);
            failed++;
            failedStocks.push({ symbol: stock.symbol, error: error.message });
            success = true; // Move on to next stock
          } else {
            console.log(`   ⚠️  Retry ${retries}/${MAX_RETRIES}...`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer before retry
          }
        }
      }

      // Save progress every 10 stocks
      if ((i + 1) % 10 === 0) {
        progress = {
          processed: i + 1,
          successful,
          failed,
          notFound,
          failedStocks
        };
        fs.writeFileSync('scraping_progress.json', JSON.stringify(progress, null, 2));
      }

      // Batch pause
      if ((i + 1) % BATCH_SIZE === 0 && i + 1 < stocks.length) {
        console.log(`\n📊 Batch complete: ${i + 1}/${stocks.length} stocks processed`);
        console.log(`   Successful: ${successful}, Not Found: ${notFound}, Failed: ${failed}`);
        console.log(`   Pausing for ${BATCH_DELAY / 1000} seconds...\n`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }

      // Progress update every 100 stocks
      if ((i + 1) % 100 === 0) {
        console.log(`\n📈 Progress: ${i + 1}/${stocks.length} (${Math.round((i + 1) / stocks.length * 100)}%)`);
        console.log(`   Successful: ${successful}, Not Found: ${notFound}, Failed: ${failed}\n`);
      }
    }

    // Final summary
    console.log('\n🎉 Scraping complete!');
    console.log(`📊 Summary:`);
    console.log(`   Total stocks: ${stocks.length}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Not found on Screener.in: ${notFound}`);
    console.log(`   Failed: ${failed}`);

    if (failedStocks.length > 0) {
      console.log(`\n❌ Failed stocks:`);
      failedStocks.forEach(s => console.log(`   ${s.symbol}: ${s.error}`));
      fs.writeFileSync('failed_stocks_scraping.json', JSON.stringify(failedStocks, null, 2));
      console.log(`\n📝 Failed stocks saved to failed_stocks_scraping.json`);
    }

    // Clean up progress file
    if (fs.existsSync('scraping_progress.json')) {
      fs.unlinkSync('scraping_progress.json');
    }

    console.log('\n✅ Next step: Run `node calculate_quality_scores.js` to compute quality scores from the scraped data');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

scrapeAllFundamentals();
