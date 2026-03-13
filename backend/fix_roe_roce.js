import db from './src/db.js';
import axios from 'axios';

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';
const FMP_BASE = 'https://financialmodelingprep.com';
const DELAY_MS = 250; // 4 calls per second = 240 calls/min

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fixROEandROCE() {
  try {
    console.log('🔧 Fixing ROE and ROCE Data\n');

    // Get all symbols from stock_key_metrics that need updating
    const symbolsResult = await db.query(`
      SELECT DISTINCT fmp_symbol
      FROM stock_key_metrics
      WHERE (roe IS NULL OR roce IS NULL)
      ORDER BY fmp_symbol
    `);

    const symbols = symbolsResult.rows.map(r => r.fmp_symbol);
    console.log(`📊 Found ${symbols.length} symbols to update\n`);

    if (symbols.length === 0) {
      console.log('✅ All stocks already have ROE and ROCE data!');
      process.exit(0);
    }

    let updated = 0;
    let noData = 0;
    let errors = 0;

    const startTime = Date.now();

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const progress = `[${i + 1}/${symbols.length}]`;

      try {
        // Fetch key metrics from FMP
        const response = await axios.get(`${FMP_BASE}/stable/key-metrics`, {
          params: { symbol, limit: 5, apikey: FMP_API_KEY },
          timeout: 10000
        });

        await sleep(DELAY_MS);

        const metricsData = response.data;
        if (!metricsData || metricsData.length === 0) {
          console.log(`${progress} ${symbol} - No data`);
          noData++;
          continue;
        }

        let updatedCount = 0;

        // Update each period's metrics
        for (const item of metricsData) {
          if (!item.date) continue;

          const periodEnd = new Date(item.date).toISOString().split('T')[0];
          const roe = item.returnOnEquity !== null && item.returnOnEquity !== undefined
            ? parseFloat(item.returnOnEquity)
            : null;
          const roce = item.returnOnCapitalEmployed !== null && item.returnOnCapitalEmployed !== undefined
            ? parseFloat(item.returnOnCapitalEmployed)
            : null;

          if (roe !== null || roce !== null) {
            const updateResult = await db.query(`
              UPDATE stock_key_metrics
              SET roe = COALESCE($3, roe),
                  roce = COALESCE($4, roce)
              WHERE fmp_symbol = $1 AND period_end = $2
            `, [symbol, periodEnd, roe, roce]);

            if (updateResult.rowCount > 0) {
              updatedCount++;
            }
          }
        }

        if (updatedCount > 0) {
          console.log(`${progress} ${symbol} - Updated ${updatedCount} periods`);
          updated++;
        } else {
          console.log(`${progress} ${symbol} - No ROE/ROCE data`);
          noData++;
        }

      } catch (error) {
        console.log(`${progress} ${symbol} - Error: ${error.message}`);
        errors++;
      }

      // Show ETA every 50 stocks
      if ((i + 1) % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (i + 1) / elapsed;
        const remaining = symbols.length - i - 1;
        const eta = Math.ceil(remaining / rate / 60);
        console.log(`\n⏱️  Progress: ${i + 1}/${symbols.length} | ETA: ~${eta} min\n`);
      }
    }

    const totalTime = (Date.now() - startTime) / 60000;

    console.log('\n' + '═'.repeat(70));
    console.log(`✅ COMPLETE (${totalTime.toFixed(1)} minutes)`);
    console.log('═'.repeat(70));
    console.log(`  Updated:    ${updated}`);
    console.log(`  No data:    ${noData}`);
    console.log(`  Errors:     ${errors}`);
    console.log('═'.repeat(70));

    // Verify results
    console.log('\n📊 Verifying ROE and ROCE data...\n');
    const verifyResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(roe) as with_roe,
        COUNT(roce) as with_roce,
        AVG(roe) as avg_roe,
        AVG(roce) as avg_roce
      FROM stock_key_metrics
      WHERE roe IS NOT NULL OR roce IS NOT NULL
    `);

    const stats = verifyResult.rows[0];
    console.log(`  Total key_metrics records: ${stats.total}`);
    console.log(`  With ROE: ${stats.with_roe} (${(stats.with_roe / stats.total * 100).toFixed(1)}%)`);
    console.log(`  With ROCE: ${stats.with_roce} (${(stats.with_roce / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Average ROE: ${stats.avg_roe ? (parseFloat(stats.avg_roe) * 100).toFixed(2) + '%' : 'N/A'}`);
    console.log(`  Average ROCE: ${stats.avg_roce ? (parseFloat(stats.avg_roce) * 100).toFixed(2) + '%' : 'N/A'}\n`);

    console.log('📊 Next step: node calculate_quality_scores_fmp.js\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

fixROEandROCE();
