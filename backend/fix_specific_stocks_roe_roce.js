import db from './src/db.js';
import axios from 'axios';

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';
const FMP_BASE = 'https://financialmodelingprep.com';

async function fixSpecificStocks() {
  const symbols = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'WIPRO.NS', 'ITC.NS'];

  for (const symbol of symbols) {
    console.log(`\n📊 Processing ${symbol}...`);

    try {
      // Fetch key metrics
      const response = await axios.get(`${FMP_BASE}/stable/key-metrics`, {
        params: { symbol, limit: 5, apikey: FMP_API_KEY },
        timeout: 10000
      });

      const metricsData = response.data;
      if (!metricsData || metricsData.length === 0) {
        console.log(`  ❌ No data returned`);
        continue;
      }

      console.log(`  Found ${metricsData.length} periods`);

      for (const item of metricsData) {
        const periodEnd = item.date;
        const roe = item.returnOnEquity;
        const roce = item.returnOnCapitalEmployed;

        console.log(`  Period ${periodEnd}: ROE=${roe ? (roe * 100).toFixed(2) + '%' : 'NULL'}, ROCE=${roce ? (roce * 100).toFixed(2) + '%' : 'NULL'}`);

        if (roe !== null && roe !== undefined || roce !== null && roce !== undefined) {
          const updateResult = await db.query(`
            UPDATE stock_key_metrics
            SET roe = $3,
                roce = $4
            WHERE fmp_symbol = $1 AND period_end = $2
          `, [symbol, periodEnd, roe, roce]);

          console.log(`    ${updateResult.rowCount > 0 ? '✅ Updated' : '❌ Not found in DB'}`);
        }
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Verify
  console.log('\n\n📊 Verification:\n');
  const verifyResult = await db.query(`
    SELECT fmp_symbol, roe, roce
    FROM stock_key_metrics
    WHERE fmp_symbol IN ('RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS')
      AND roe IS NOT NULL
    ORDER BY fmp_symbol, period_end DESC
  `);

  verifyResult.rows.forEach(row => {
    const roe = (parseFloat(row.roe) * 100).toFixed(2) + '%';
    const roce = (parseFloat(row.roce) * 100).toFixed(2) + '%';
    console.log(`${row.fmp_symbol}: ROE=${roe}, ROCE=${roce}`);
  });

  process.exit(0);
}

fixSpecificStocks();
