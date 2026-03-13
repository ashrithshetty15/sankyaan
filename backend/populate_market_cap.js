import db from './src/db.js';
import axios from 'axios';

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';
const FMP_BASE = 'https://financialmodelingprep.com';
const DELAY_MS = 250; // 4 calls per second

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function populateMarketCap() {
  try {
    console.log('🔧 Populating Market Cap from FMP\n');

    // Get all stocks
    const stocksResult = await db.query(`
      SELECT fmp_symbol
      FROM stock_quotes
      WHERE market_cap IS NULL OR market_cap_cr IS NULL
      ORDER BY fmp_symbol
    `);

    const stocks = stocksResult.rows;
    console.log(`📊 Found ${stocks.length} stocks needing market cap\n`);

    if (stocks.length === 0) {
      console.log('✅ All stocks already have market cap data!');
      process.exit(0);
    }

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < stocks.length; i++) {
      const symbol = stocks[i].fmp_symbol;
      const progress = `[${i + 1}/${stocks.length}]`;

      try {
        // Fetch profile
        const response = await axios.get(`${FMP_BASE}/stable/profile`, {
          params: { symbol, apikey: FMP_API_KEY },
          timeout: 10000
        });

        await sleep(DELAY_MS);

        if (!response.data || response.data.length === 0) {
          console.log(`${progress} ${symbol} - No data`);
          errors++;
          continue;
        }

        const profile = response.data[0];
        const marketCap = profile.marketCap ? parseInt(profile.marketCap) : null;
        const marketCapCr = marketCap ? Math.round(marketCap / 10000000 * 100) / 100 : null;

        if (marketCap) {
          await db.query(`
            UPDATE stock_quotes
            SET market_cap = $2,
                market_cap_cr = $3
            WHERE fmp_symbol = $1
          `, [symbol, marketCap, marketCapCr]);

          console.log(`${progress} ${symbol} - ₹${marketCapCr.toFixed(0)} Cr`);
          updated++;
        } else {
          console.log(`${progress} ${symbol} - No market cap in API`);
          errors++;
        }

        if ((i + 1) % 50 === 0) {
          console.log(`\n⏱️  Progress: ${i + 1}/${stocks.length}\n`);
        }

      } catch (error) {
        console.log(`${progress} ${symbol} - Error: ${error.message}`);
        errors++;
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log(`✅ COMPLETE`);
    console.log('═'.repeat(70));
    console.log(`  Updated:    ${updated}`);
    console.log(`  Errors:     ${errors}`);
    console.log('═'.repeat(70));

    // Now calculate P/B ratio
    console.log('\n📊 Calculating P/B Ratios...\n');
    const pbResult = await db.query(`
      WITH latest_bs AS (
        SELECT DISTINCT ON (fmp_symbol)
          fmp_symbol,
          total_stockholders_equity
        FROM stock_balance_sheet
        WHERE total_stockholders_equity IS NOT NULL
          AND total_stockholders_equity > 0
        ORDER BY fmp_symbol, period_end DESC
      )
      UPDATE stock_key_metrics km
      SET pb_ratio = ROUND((q.market_cap / bs.total_stockholders_equity), 2)
      FROM stock_quotes q
      JOIN latest_bs bs ON bs.fmp_symbol = q.fmp_symbol
      WHERE km.fmp_symbol = q.fmp_symbol
        AND q.market_cap IS NOT NULL
        AND q.market_cap > 0
        AND bs.total_stockholders_equity > 0
    `);

    console.log(`✅ Updated ${pbResult.rowCount} P/B ratios\n`);

    // Verify
    const verifyResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(pb_ratio) as has_pb,
        AVG(pb_ratio) as avg_pb
      FROM stock_key_metrics
      WHERE pb_ratio IS NOT NULL
    `);
    const v = verifyResult.rows[0];
    console.log(`P/B Coverage: ${v.has_pb} / ${v.total} (${(v.has_pb / v.total * 100).toFixed(1)}%)`);
    console.log(`Average P/B: ${v.avg_pb ? parseFloat(v.avg_pb).toFixed(2) : 'N/A'}`);

    console.log('\n✅ Market cap and P/B ratio populated successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

populateMarketCap();
