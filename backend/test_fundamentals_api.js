import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function testFundamentalsAPI() {
  try {
    const symbol = 'RELIANCE.NS';
    console.log(`Testing fundamentalsTimeSeries for ${symbol}...\n`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 2);

    // Try different modules
    const modules = ['income', 'balance-sheet', 'cash-flow', 'financials'];

    for (const module of modules) {
      try {
        console.log(`\n━━━ Testing module: "${module}" ━━━`);
        const result = await yahooFinance.fundamentalsTimeSeries(symbol, {
          period1: startDate,
          period2: endDate,
          type: 'annual',
          module: module
        });

        console.log('Result keys:', Object.keys(result));

        if (result) {
          console.log('\nData sample:');
          console.log(JSON.stringify(result, null, 2).substring(0, 1000) + '...');
        }
      } catch (error) {
        console.log(`✗ Module "${module}" failed: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  }
}

testFundamentalsAPI();
