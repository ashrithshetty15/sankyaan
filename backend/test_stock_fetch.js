import { fetchStockQuote, getStockData, fetchHistoricalPrices } from './src/stockDataFetcher.js';

async function testStockFetch() {
  try {
    console.log('🧪 Testing stock data fetching...\n');

    // Test with NSE stock (TCS)
    const symbol = 'TCS.NS'; // .NS for NSE, .BO for BSE

    console.log(`1. Fetching current quote for ${symbol}...`);
    const quote = await fetchStockQuote(symbol);
    console.log('✅ Quote fetched:');
    console.log(`   Company: ${quote.companyName}`);
    console.log(`   Price: ₹${quote.currentPrice}`);
    console.log(`   Market Cap: ₹${(quote.marketCap / 10000000).toFixed(2)} Cr`);
    console.log(`   P/E: ${quote.pe}`);

    console.log(`\n2. Fetching historical data (last 30 days)...`);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const count = await fetchHistoricalPrices(symbol, thirtyDaysAgo, new Date());
    console.log(`✅ Stored ${count} historical records`);

    console.log(`\n3. Getting complete stock data from database...`);
    const stockData = await getStockData(symbol);
    console.log('✅ Complete data retrieved:');
    console.log(`   Symbol: ${stockData.symbol}`);
    console.log(`   Company: ${stockData.company_name}`);
    console.log(`   Sector: ${stockData.sector || 'N/A'}`);
    console.log(`   Industry: ${stockData.industry || 'N/A'}`);
    console.log(`   Price history records: ${stockData.priceHistory.length}`);

    console.log('\n✨ All tests passed!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Test failed:', e.message);
    console.error(e);
    process.exit(1);
  }
}

testStockFetch();
