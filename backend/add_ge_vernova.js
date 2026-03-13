import { fetchStockQuote, fetchHistoricalPrices } from './src/stockDataFetcher.js';

async function addGEVernova() {
  try {
    console.log('📊 Fetching GE Vernova (GVT&D.NS) from Yahoo Finance...\n');

    const symbol = 'GVT&D.NS';

    // Fetch quote
    const quote = await fetchStockQuote(symbol);

    if (quote) {
      console.log('✅ Stock fetched successfully');
      console.log(`   Symbol: ${quote.symbol}`);
      console.log(`   Company: ${quote.company_name}`);
      console.log(`   Price: ₹${quote.current_price}`);
      console.log(`   Market Cap: ₹${(quote.market_cap / 10000000).toFixed(2)} Cr`);
      console.log(`   Sector: ${quote.sector}`);
      console.log(`   Industry: ${quote.industry}\n`);

      // Fetch historical prices
      const period2 = Math.floor(Date.now() / 1000);
      const period1 = period2 - (365 * 24 * 60 * 60); // 1 year ago

      console.log('📈 Fetching historical prices...');
      const prices = await fetchHistoricalPrices(symbol, period1, period2);
      console.log(`✅ Fetched ${prices?.length || 0} historical price records\n`);

      console.log('✅ GE Vernova has been added to the stocks table!');
      console.log('   Stock ID:', quote.id);
    } else {
      console.log('❌ Stock not found on Yahoo Finance');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

addGEVernova();
