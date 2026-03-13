import { getStockData } from './src/stockDataFetcher.js';

async function testStockDetail() {
  try {
    console.log('Testing getStockData for RELIANCE.NS...\n');
    const data = await getStockData('RELIANCE.NS');

    console.log('✅ Success!');
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  }

  process.exit(0);
}

testStockDetail();
