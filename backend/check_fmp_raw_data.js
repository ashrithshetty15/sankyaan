import db from './src/db.js';
import axios from 'axios';

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';

async function checkFMPData() {
  try {
    // 1. Check what we saved to database
    console.log('📊 Database: RELIANCE.NS Financial Data\n');
    const dbResult = await db.query(`
      SELECT fmp_symbol, period_end, revenue, net_income, eps, eps_diluted, shares_outstanding
      FROM stock_financials
      WHERE fmp_symbol = 'RELIANCE.NS'
      ORDER BY period_end DESC
      LIMIT 1
    `);

    if (dbResult.rows.length > 0) {
      console.log(JSON.stringify(dbResult.rows[0], null, 2));
    } else {
      console.log('No data found in database');
    }

    // 2. Check what FMP API actually returns
    console.log('\n\n🌐 FMP API: Income Statement Response\n');
    const apiResponse = await axios.get('https://financialmodelingprep.com/stable/income-statement', {
      params: { symbol: 'RELIANCE.NS', limit: 1, apikey: FMP_API_KEY }
    });

    console.log(JSON.stringify(apiResponse.data[0], null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkFMPData();
