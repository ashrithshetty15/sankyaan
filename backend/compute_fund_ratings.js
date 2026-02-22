/**
 * Compute and store fund quality scores in the fund_quality_scores table.
 *
 * Run once to populate, then re-run anytime to refresh:
 *   node compute_fund_ratings.js
 *
 * This script runs the heavy LATERAL JOIN query once and persists results,
 * so the API can serve ratings from DB instantly (no recomputation per request).
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Support DATABASE_URL (Railway/production) or individual vars (local)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 300000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'Sankyaan',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'Sankyaan',
      port: process.env.DB_PORT || 5432,
      statement_timeout: 300000,
    });

async function computeAndStoreFundRatings() {
  console.log('🔄 Computing fund quality scores...');
  console.log('   (This will take ~20-30 seconds — running once and caching)\n');

  const startTime = Date.now();

  const computeQuery = `
    WITH matched_stocks AS (
      SELECT
        mp.fund_name,
        mp.scheme_name,
        mp.fund_house,
        mp.instrument_name,
        mp.percent_nav AS weight,
        qs.overall_quality_score,
        qs.piotroski_score,
        qs.altman_z_score,
        qs.financial_health_score,
        qs.management_quality_score,
        qs.earnings_quality_score,
        src.cagr_1y AS stock_cagr_1y,
        src.cagr_3y AS stock_cagr_3y,
        src.cagr_5y AS stock_cagr_5y,
        src.cagr_10y AS stock_cagr_10y
      FROM mutualfund_portfolio mp
      LEFT JOIN stock_quality_scores qs ON qs.stock_id = mp.stock_id
      LEFT JOIN stocks s ON s.id = mp.stock_id
      LEFT JOIN stock_ratings_cache src ON src.symbol = s.symbol
      WHERE mp.stock_id IS NOT NULL
        AND mp.percent_nav > 0
        AND qs.overall_quality_score IS NOT NULL
    )
    SELECT
      fund_name,
      MAX(scheme_name) AS scheme_name,
      MAX(fund_house) AS fund_house,
      COUNT(DISTINCT instrument_name)::integer AS scored_holdings,
      ROUND(SUM(weight)::numeric, 2) AS coverage_pct,
      ROUND((SUM(overall_quality_score * weight) / NULLIF(SUM(weight), 0))::numeric, 2) AS overall_quality_score,
      ROUND((SUM(piotroski_score * weight) / NULLIF(SUM(weight), 0))::numeric, 2) AS piotroski_score,
      ROUND((SUM(altman_z_score * weight) / NULLIF(SUM(weight), 0))::numeric, 2) AS altman_z_score,
      ROUND((SUM(financial_health_score * weight) / NULLIF(SUM(weight), 0))::numeric, 2) AS financial_health_score,
      ROUND((SUM(management_quality_score * weight) / NULLIF(SUM(weight), 0))::numeric, 2) AS management_quality_score,
      ROUND((SUM(earnings_quality_score * weight) / NULLIF(SUM(weight), 0))::numeric, 2) AS earnings_quality_score,
      ROUND((SUM(stock_cagr_1y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_1y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_1y,
      ROUND((SUM(stock_cagr_3y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_3y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_3y,
      ROUND((SUM(stock_cagr_5y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_5y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_5y,
      ROUND((SUM(stock_cagr_10y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_10y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_10y
    FROM matched_stocks
    GROUP BY fund_name
    HAVING COUNT(instrument_name) > 0
    ORDER BY overall_quality_score DESC NULLS LAST
  `;

  const result = await pool.query(computeQuery);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Computed scores for ${result.rows.length} funds in ${elapsed}s`);

  if (result.rows.length === 0) {
    console.log('⚠️  No fund scores computed. Check that stocks and quality scores are populated.');
    await pool.end();
    return;
  }

  // Upsert all rows into fund_quality_scores
  console.log('\n💾 Storing results in fund_quality_scores table...');

  const upsertQuery = `
    INSERT INTO fund_quality_scores (
      fund_name, scheme_name, fund_house, scored_holdings, coverage_pct,
      overall_quality_score, piotroski_score, altman_z_score,
      financial_health_score, management_quality_score, earnings_quality_score,
      cagr_1y, cagr_3y, cagr_5y, cagr_10y,
      calculated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
    )
    ON CONFLICT (fund_name) DO UPDATE SET
      scheme_name = EXCLUDED.scheme_name,
      fund_house = EXCLUDED.fund_house,
      scored_holdings = EXCLUDED.scored_holdings,
      coverage_pct = EXCLUDED.coverage_pct,
      overall_quality_score = EXCLUDED.overall_quality_score,
      piotroski_score = EXCLUDED.piotroski_score,
      altman_z_score = EXCLUDED.altman_z_score,
      financial_health_score = EXCLUDED.financial_health_score,
      management_quality_score = EXCLUDED.management_quality_score,
      earnings_quality_score = EXCLUDED.earnings_quality_score,
      cagr_1y = EXCLUDED.cagr_1y,
      cagr_3y = EXCLUDED.cagr_3y,
      cagr_5y = EXCLUDED.cagr_5y,
      cagr_10y = EXCLUDED.cagr_10y,
      calculated_at = NOW()
  `;

  let stored = 0;
  for (const row of result.rows) {
    await pool.query(upsertQuery, [
      row.fund_name,
      row.scheme_name,
      row.fund_house,
      row.scored_holdings,
      row.coverage_pct,
      row.overall_quality_score,
      row.piotroski_score,
      row.altman_z_score,
      row.financial_health_score,
      row.management_quality_score,
      row.earnings_quality_score,
      row.cagr_1y,
      row.cagr_3y,
      row.cagr_5y,
      row.cagr_10y,
    ]);
    stored++;
    if (stored % 50 === 0) {
      process.stdout.write(`   Stored ${stored}/${result.rows.length}...\r`);
    }
  }

  console.log(`\n✅ Stored ${stored} fund ratings in DB`);
  console.log('\n📊 Top 5 funds by quality:');
  result.rows.slice(0, 5).forEach((f, i) => {
    console.log(`   #${i + 1} ${(f.scheme_name || f.fund_name).substring(0, 50).padEnd(50)} Quality: ${f.overall_quality_score}`);
  });

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Done in ${totalElapsed}s total. API will now serve from DB (< 100ms).`);

  await pool.end();
}

computeAndStoreFundRatings().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
