import db from './src/db.js';

/**
 * Check FMP data population status
 * Shows how many stocks have FMP data and what's missing
 */

async function checkFMPStatus() {
  console.log('\n📊 FMP Data Population Status\n');
  console.log('='.repeat(70));

  try {
    // Total NSE symbols
    const totalSymbols = await db.query('SELECT COUNT(*) FROM nse_symbol_map');
    const total = parseInt(totalSymbols.rows[0].count);

    // Stocks in database
    const stocksResult = await db.query('SELECT COUNT(*) FROM stocks');
    const stocksCount = parseInt(stocksResult.rows[0].count);

    // Stocks with price data
    const pricesResult = await db.query(`
      SELECT COUNT(DISTINCT stock_id)
      FROM stock_prices
    `);
    const pricesCount = parseInt(pricesResult.rows[0].count);

    // Stocks with fundamentals
    const fundamentalsResult = await db.query('SELECT COUNT(*) FROM stock_fundamentals');
    const fundamentalsCount = parseInt(fundamentalsResult.rows[0].count);

    // Stocks with complete data (prices AND fundamentals)
    const completeResult = await db.query(`
      SELECT COUNT(DISTINCT s.id)
      FROM stocks s
      WHERE EXISTS (SELECT 1 FROM stock_prices WHERE stock_id = s.id)
        AND EXISTS (SELECT 1 FROM stock_fundamentals WHERE stock_id = s.id)
    `);
    const completeCount = parseInt(completeResult.rows[0].count);

    // Recent updates (last 7 days)
    const recentResult = await db.query(`
      SELECT COUNT(*)
      FROM stocks
      WHERE updated_at > NOW() - INTERVAL '7 days'
    `);
    const recentCount = parseInt(recentResult.rows[0].count);

    // Print statistics
    console.log('\n📈 OVERALL STATISTICS\n');
    console.log(`Total NSE Symbols:              ${total.toLocaleString()}`);
    console.log(`Stocks in Database:             ${stocksCount.toLocaleString()} (${((stocksCount / total) * 100).toFixed(1)}%)`);
    console.log(`Stocks with Price Data:         ${pricesCount.toLocaleString()} (${((pricesCount / total) * 100).toFixed(1)}%)`);
    console.log(`Stocks with Fundamentals:       ${fundamentalsCount.toLocaleString()} (${((fundamentalsCount / total) * 100).toFixed(1)}%)`);
    console.log(`Stocks with Complete Data:      ${completeCount.toLocaleString()} (${((completeCount / total) * 100).toFixed(1)}%)`);
    console.log(`Recently Updated (7 days):      ${recentCount.toLocaleString()}`);

    // Missing data
    const missingCount = total - completeCount;
    console.log('\n' + '─'.repeat(70));
    console.log(`\n❌ Missing Complete Data:        ${missingCount.toLocaleString()} (${((missingCount / total) * 100).toFixed(1)}%)`);

    // Top 10 stocks by market cap with data
    console.log('\n📊 TOP 10 STOCKS WITH FMP DATA (by Market Cap)\n');
    const topStocks = await db.query(`
      SELECT s.symbol, s.company_name, s.market_cap,
        (SELECT COUNT(*) FROM stock_prices WHERE stock_id = s.id) as price_records
      FROM stocks s
      WHERE EXISTS (SELECT 1 FROM stock_fundamentals WHERE stock_id = s.id)
      ORDER BY s.market_cap DESC NULLS LAST
      LIMIT 10
    `);

    topStocks.rows.forEach((stock, index) => {
      const marketCapCr = (parseFloat(stock.market_cap || 0) / 10000000).toFixed(0);
      console.log(`${(index + 1).toString().padStart(2)}. ${stock.symbol.padEnd(15)} ${stock.company_name.substring(0, 30).padEnd(30)} ₹${marketCapCr.padStart(8)} Cr  (${stock.price_records} prices)`);
    });

    // Data quality metrics
    console.log('\n📉 DATA QUALITY METRICS\n');

    const avgPrices = await db.query(`
      SELECT AVG(price_count) as avg_prices
      FROM (
        SELECT stock_id, COUNT(*) as price_count
        FROM stock_prices
        GROUP BY stock_id
      ) counts
    `);

    const priceStats = await db.query(`
      SELECT
        MIN(price_count) as min_prices,
        MAX(price_count) as max_prices,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_count) as median_prices
      FROM (
        SELECT stock_id, COUNT(*) as price_count
        FROM stock_prices
        GROUP BY stock_id
      ) counts
    `);

    console.log(`Average Price Records per Stock:  ${parseFloat(avgPrices.rows[0]?.avg_prices || 0).toFixed(0)}`);
    console.log(`Min Price Records:                ${priceStats.rows[0]?.min_prices || 0}`);
    console.log(`Median Price Records:             ${parseFloat(priceStats.rows[0]?.median_prices || 0).toFixed(0)}`);
    console.log(`Max Price Records:                ${priceStats.rows[0]?.max_prices || 0}`);

    // Storage size
    console.log('\n💾 DATABASE STORAGE\n');

    const sizeResult = await db.query(`
      SELECT
        pg_size_pretty(pg_total_relation_size('stocks')) as stocks_size,
        pg_size_pretty(pg_total_relation_size('stock_prices')) as prices_size,
        pg_size_pretty(pg_total_relation_size('stock_fundamentals')) as fundamentals_size
    `);

    if (sizeResult.rows.length > 0) {
      const sizes = sizeResult.rows[0];
      console.log(`Stocks Table:                   ${sizes.stocks_size}`);
      console.log(`Stock Prices Table:             ${sizes.prices_size}`);
      console.log(`Stock Fundamentals Table:       ${sizes.fundamentals_size}`);
    }

    console.log('\n' + '='.repeat(70) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkFMPStatus();
