import db from './src/db.js';

async function fixMarketCap() {
  try {
    console.log('🔧 Fixing Market Cap Data\n');

    // 1. Check current state
    console.log('1️⃣  Checking current market cap data...');
    const checkResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(market_cap) as has_market_cap,
        COUNT(market_cap_cr) as has_market_cap_cr,
        COUNT(current_price) as has_price
      FROM stock_quotes
    `);
    const current = checkResult.rows[0];
    console.log(`   Total records: ${current.total}`);
    console.log(`   With market_cap: ${current.has_market_cap}`);
    console.log(`   With market_cap_cr: ${current.has_market_cap_cr}`);
    console.log(`   With current_price: ${current.has_price}\n`);

    // 2. Populate market_cap_cr from market_cap (if it exists)
    console.log('2️⃣  Populating market_cap_cr from market_cap...');
    const mcCrUpdate = await db.query(`
      UPDATE stock_quotes
      SET market_cap_cr = ROUND((market_cap / 10000000), 2)
      WHERE market_cap IS NOT NULL
        AND market_cap > 0
        AND market_cap_cr IS NULL
    `);
    console.log(`   ✅ Updated ${mcCrUpdate.rowCount} records\n`);

    // 3. Populate market_cap from market_cap_cr (reverse)
    console.log('3️⃣  Populating market_cap from market_cap_cr...');
    const mcUpdate = await db.query(`
      UPDATE stock_quotes
      SET market_cap = market_cap_cr * 10000000
      WHERE market_cap_cr IS NOT NULL
        AND market_cap_cr > 0
        AND market_cap IS NULL
    `);
    console.log(`   ✅ Updated ${mcUpdate.rowCount} records\n`);

    // 4. Verify
    console.log('4️⃣  Verification after update...');
    const verifyResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(market_cap) as has_market_cap,
        COUNT(market_cap_cr) as has_market_cap_cr
      FROM stock_quotes
    `);
    const verified = verifyResult.rows[0];
    console.log(`   Total records: ${verified.total}`);
    console.log(`   With market_cap: ${verified.has_market_cap} (${(verified.has_market_cap / verified.total * 100).toFixed(1)}%)`);
    console.log(`   With market_cap_cr: ${verified.has_market_cap_cr} (${(verified.has_market_cap_cr / verified.total * 100).toFixed(1)}%)\n`);

    // If still no data, calculate from profile
    if (parseInt(verified.has_market_cap) === 0) {
      console.log('⚠️  No market cap data found. This column may need to be populated by fetch_fmp_fundamentals.js');
      console.log('   Market cap should come from FMP profile API: profile.mktCap');
    }

    // 5. Now calculate P/B ratio
    console.log('5️⃣  Calculating P/B Ratio...');
    const pbUpdate = await db.query(`
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
    console.log(`   ✅ Updated ${pbUpdate.rowCount} P/B ratios\n`);

    // 6. Final verification
    console.log('6️⃣  Final P/B verification...');
    const pbVerify = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(pb_ratio) as has_pb,
        AVG(pb_ratio) as avg_pb,
        MIN(pb_ratio) as min_pb,
        MAX(pb_ratio) as max_pb
      FROM stock_key_metrics
      WHERE pb_ratio IS NOT NULL AND pb_ratio > 0
    `);
    const pb = pbVerify.rows[0];
    console.log(`   Total key_metrics: ${pb.total || 0}`);
    console.log(`   With P/B: ${pb.has_pb || 0} (${pb.total > 0 ? (pb.has_pb / pb.total * 100).toFixed(1) : 0}%)`);
    if (pb.avg_pb) {
      console.log(`   Average P/B: ${parseFloat(pb.avg_pb).toFixed(2)}`);
      console.log(`   P/B Range: ${parseFloat(pb.min_pb).toFixed(2)} - ${parseFloat(pb.max_pb).toFixed(2)}`);
    }

    // Sample
    console.log('\n📊 Sample: RELIANCE.NS\n');
    const sampleResult = await db.query(`
      SELECT
        km.fmp_symbol,
        q.market_cap,
        q.market_cap_cr,
        bs.total_stockholders_equity,
        km.pb_ratio
      FROM stock_key_metrics km
      JOIN stock_quotes q ON q.fmp_symbol = km.fmp_symbol
      JOIN LATERAL (
        SELECT total_stockholders_equity
        FROM stock_balance_sheet
        WHERE fmp_symbol = km.fmp_symbol
        ORDER BY period_end DESC
        LIMIT 1
      ) bs ON true
      WHERE km.fmp_symbol = 'RELIANCE.NS'
      ORDER BY km.period_end DESC
      LIMIT 1
    `);

    if (sampleResult.rows.length > 0) {
      const s = sampleResult.rows[0];
      console.log(`Market Cap: ₹${s.market_cap ? (parseFloat(s.market_cap) / 10000000).toFixed(0) : 'NULL'} Cr`);
      console.log(`Stockholders Equity: ₹${s.total_stockholders_equity ? (parseFloat(s.total_stockholders_equity) / 10000000).toFixed(0) : 'NULL'} Cr`);
      console.log(`P/B Ratio: ${s.pb_ratio || 'NULL'}`);
    }

    console.log('\n✅ Market cap and P/B ratio processing complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixMarketCap();
