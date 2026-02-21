import db from './src/db.js';

/**
 * Fix P/E Ratio Data
 * 1. Copy eps to eps_diluted where NULL
 * 2. Calculate P/E = current_price / eps_diluted
 * 3. Update stock_key_metrics with calculated P/E
 */

async function fixPERatios() {
  try {
    console.log('🔧 Fixing P/E Ratio Data\n');

    // Step 1: Copy eps to eps_diluted where NULL
    console.log('1️⃣  Copying EPS to EPS Diluted where NULL...');
    const updateResult = await db.query(`
      UPDATE stock_financials
      SET eps_diluted = eps
      WHERE eps_diluted IS NULL AND eps IS NOT NULL
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} rows\n`);

    // Step 2: Calculate P/E for each stock
    console.log('2️⃣  Calculating P/E ratios...');

    // Get stocks with price and latest EPS
    const stocksResult = await db.query(`
      SELECT DISTINCT
        sq.fmp_symbol,
        sq.current_price,
        sf.period_end,
        sf.eps_diluted,
        (sq.current_price / NULLIF(sf.eps_diluted, 0)) as pe_ratio
      FROM stock_quotes sq
      LEFT JOIN LATERAL (
        SELECT period_end, eps_diluted
        FROM stock_financials
        WHERE fmp_symbol = sq.fmp_symbol
          AND eps_diluted IS NOT NULL
          AND eps_diluted > 0
        ORDER BY period_end DESC
        LIMIT 1
      ) sf ON true
      WHERE sq.current_price IS NOT NULL
        AND sq.current_price > 0
        AND sf.eps_diluted IS NOT NULL
    `);

    console.log(`   Found ${stocksResult.rows.length} stocks with price & EPS`);

    // Step 3: Update or insert P/E into stock_key_metrics
    let updated = 0;
    let inserted = 0;

    for (const stock of stocksResult.rows) {
      if (!stock.pe_ratio || !isFinite(stock.pe_ratio)) continue;

      // Try to update existing key_metrics record
      const updateResult = await db.query(`
        UPDATE stock_key_metrics
        SET pe_ratio = $2
        FROM (
          SELECT fmp_symbol, period_end
          FROM stock_key_metrics
          WHERE fmp_symbol = $1
          ORDER BY period_end DESC
          LIMIT 1
        ) AS latest
        WHERE stock_key_metrics.fmp_symbol = latest.fmp_symbol
          AND stock_key_metrics.period_end = latest.period_end
      `, [stock.fmp_symbol, stock.pe_ratio]);

      if (updateResult.rowCount > 0) {
        updated++;
      } else {
        // No key_metrics record exists, insert one
        const insertResult = await db.query(`
          INSERT INTO stock_key_metrics (
            fmp_symbol, period_end, pe_ratio, fetch_date
          )
          SELECT $1, $2, $3, CURRENT_DATE
          FROM (SELECT 1) AS dummy
          WHERE NOT EXISTS (
            SELECT 1 FROM stock_key_metrics
            WHERE fmp_symbol = $1 AND period_end = $2
          )
        `, [stock.fmp_symbol, stock.period_end, stock.pe_ratio]);

        if (insertResult.rowCount > 0) {
          inserted++;
        }
      }

      if ((updated + inserted) % 50 === 0) {
        console.log(`   Processed ${updated + inserted} stocks...`);
      }
    }

    console.log(`   ✅ Updated ${updated} existing records`);
    console.log(`   ✅ Inserted ${inserted} new records\n`);

    // Step 4: Verify results
    console.log('3️⃣  Verifying P/E data...');
    const verifyResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(pe_ratio) as with_pe,
        AVG(pe_ratio) as avg_pe,
        MIN(pe_ratio) as min_pe,
        MAX(pe_ratio) as max_pe
      FROM stock_key_metrics
      WHERE pe_ratio IS NOT NULL AND pe_ratio > 0 AND pe_ratio < 500
    `);

    const stats = verifyResult.rows[0];
    console.log(`   Total key_metrics records: ${stats.total}`);
    console.log(`   Records with P/E: ${stats.with_pe}`);
    console.log(`   Average P/E: ${stats.avg_pe ? parseFloat(stats.avg_pe).toFixed(2) : 'N/A'}`);
    console.log(`   P/E Range: ${stats.min_pe ? parseFloat(stats.min_pe).toFixed(2) : 'N/A'} - ${stats.max_pe ? parseFloat(stats.max_pe).toFixed(2) : 'N/A'}\n`);

    // Show sample stocks
    const sampleResult = await db.query(`
      SELECT km.fmp_symbol, km.pe_ratio, sq.current_price, sf.eps_diluted
      FROM stock_key_metrics km
      JOIN stock_quotes sq ON sq.fmp_symbol = km.fmp_symbol
      JOIN LATERAL (
        SELECT eps_diluted
        FROM stock_financials
        WHERE fmp_symbol = km.fmp_symbol
          AND eps_diluted IS NOT NULL
        ORDER BY period_end DESC
        LIMIT 1
      ) sf ON true
      WHERE km.pe_ratio IS NOT NULL
        AND km.pe_ratio > 0
      ORDER BY km.pe_ratio DESC
      LIMIT 10
    `);

    console.log('4️⃣  Sample stocks with P/E:');
    sampleResult.rows.forEach(row => {
      const pe = parseFloat(row.pe_ratio);
      const price = parseFloat(row.current_price);
      const eps = parseFloat(row.eps_diluted);
      console.log(`   ${row.fmp_symbol.padEnd(20)} P/E=${pe.toFixed(2).padStart(8)} (Price=₹${price.toFixed(2)}, EPS=₹${eps.toFixed(2)})`);
    });

    console.log('\n✅ P/E ratios fixed!');
    console.log('\n📊 Next step: node calculate_quality_scores_fmp.js\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPERatios();
