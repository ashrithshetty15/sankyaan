import db from './src/db.js';

/**
 * Populate stock_ratings_cache table with pre-computed stock ratings
 * This makes the /api/stock-ratings endpoint super fast (< 50ms)
 */
async function computeStockRatingsCache() {
  try {
    console.log('🔄 Computing stock ratings cache...\n');

    // Query to get all stock data with latest quality scores and current price
    const computeQuery = `
      SELECT
        s.symbol,
        s.company_name,
        s.sector,
        s.industry,
        s.market_cap,
        s.exchange,
        qs.overall_quality_score,
        qs.piotroski_score,
        qs.magic_formula_score,
        qs.canslim_score,
        qs.altman_z_score,
        qs.financial_health_score,
        qs.management_quality_score,
        qs.earnings_quality_score,
        qs.calculated_date,
        (
          SELECT close
          FROM stock_prices
          WHERE stock_id = s.id
          ORDER BY date DESC
          LIMIT 1
        ) as current_price
      FROM stocks s
      INNER JOIN LATERAL (
        SELECT *
        FROM stock_quality_scores
        WHERE stock_id = s.id
        ORDER BY calculated_date DESC
        LIMIT 1
      ) qs ON true
      WHERE qs.overall_quality_score IS NOT NULL
      ORDER BY s.symbol
    `;

    console.log('📊 Fetching stock data with quality scores...');
    const result = await db.query(computeQuery);
    console.log(`✅ Found ${result.rows.length} stocks with quality scores\n`);

    if (result.rows.length === 0) {
      console.log('⚠️  No stocks with quality scores found.');
      console.log('   Run `node calculate_quality_scores.js` first.');
      process.exit(0);
    }

    // Clear existing cache
    console.log('🗑️  Clearing existing cache...');
    await db.query('TRUNCATE TABLE stock_ratings_cache');

    // Insert all rows into cache
    console.log('💾 Populating cache...');
    const insertQuery = `
      INSERT INTO stock_ratings_cache (
        symbol, company_name, sector, industry, market_cap, exchange,
        current_price, overall_quality_score, piotroski_score,
        magic_formula_score, canslim_score, altman_z_score,
        financial_health_score, management_quality_score, earnings_quality_score,
        calculated_date, cached_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    `;

    let inserted = 0;
    for (const row of result.rows) {
      await db.query(insertQuery, [
        row.symbol,
        row.company_name,
        row.sector,
        row.industry,
        row.market_cap,
        row.exchange,
        row.current_price,
        row.overall_quality_score,
        row.piotroski_score,
        row.magic_formula_score,
        row.canslim_score,
        row.altman_z_score,
        row.financial_health_score,
        row.management_quality_score,
        row.earnings_quality_score,
        row.calculated_date
      ]);
      inserted++;

      if (inserted % 100 === 0) {
        console.log(`   Cached ${inserted}/${result.rows.length} stocks...`);
      }
    }

    console.log(`\n✨ Cache populated successfully!`);
    console.log(`   - Total stocks: ${inserted}`);
    console.log(`   - Cached at: ${new Date().toISOString()}`);
    console.log(`\n🚀 Stock ratings API is now optimized for fast serving!`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error computing stock ratings cache:', error);
    process.exit(1);
  }
}

computeStockRatingsCache();
