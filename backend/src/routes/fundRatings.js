import db from '../db.js';

/**
 * GET /api/fund-ratings
 * Serve pre-computed fund quality scores from fund_quality_scores table.
 * Returns results instantly (< 100ms).
 * Run `node compute_fund_ratings.js` to populate/refresh the table.
 */
export async function getFundRatings(req, res) {
  try {
    const { fundHouse } = req.query;

    let query = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY overall_quality_score DESC NULLS LAST) AS rank,
        fund_name AS ticker,
        scheme_name,
        fund_house,
        fund_manager,
        scored_holdings,
        coverage_pct,
        overall_quality_score,
        piotroski_score,
        altman_z_score,
        financial_health_score,
        management_quality_score,
        earnings_quality_score,
        profitability_score,
        financial_strength_score,
        earnings_quality_score_v2,
        growth_score,
        valuation_score,
        calculated_at,
        cagr_1y,
        cagr_3y,
        cagr_5y,
        cagr_10y,
        expense_ratio
      FROM fund_quality_scores
      WHERE overall_quality_score IS NOT NULL
        AND coverage_pct >= 50
    `;
    const params = [];

    if (fundHouse) {
      params.push(fundHouse);
      query += ` AND fund_house = $${params.length}`;
    }

    query += ` ORDER BY overall_quality_score DESC NULLS LAST`;

    const result = await db.query(query, params);

    // Get the timestamp of the most recent calculation
    const lastUpdated = result.rows.length > 0
      ? result.rows[0].calculated_at
      : null;

    res.json({
      funds: result.rows,
      totalFunds: result.rows.length,
      lastUpdated,
      source: 'cache'
    });

  } catch (error) {
    console.error('Error fetching fund ratings:', error);
    res.status(500).json({ error: 'Failed to fetch fund ratings' });
  }
}

/**
 * POST /api/fund-ratings/refresh
 * Recompute all fund quality scores and store in DB.
 * This is the slow operation (~20-30s) — call it deliberately.
 */
export async function refreshFundRatings(req, res) {
  try {
    console.log('🔄 Refreshing fund quality scores (triggered via API)...');

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
          qs.profitability_score,
          qs.financial_strength_score,
          qs.earnings_quality_score_v2,
          qs.growth_score,
          qs.valuation_score,
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
        ROUND((SUM(profitability_score * weight) / NULLIF(SUM(CASE WHEN profitability_score IS NOT NULL THEN weight END), 0))::numeric, 2) AS profitability_score,
        ROUND((SUM(financial_strength_score * weight) / NULLIF(SUM(CASE WHEN financial_strength_score IS NOT NULL THEN weight END), 0))::numeric, 2) AS financial_strength_score,
        ROUND((SUM(earnings_quality_score_v2 * weight) / NULLIF(SUM(CASE WHEN earnings_quality_score_v2 IS NOT NULL THEN weight END), 0))::numeric, 2) AS earnings_quality_score_v2,
        ROUND((SUM(growth_score * weight) / NULLIF(SUM(CASE WHEN growth_score IS NOT NULL THEN weight END), 0))::numeric, 2) AS growth_score,
        ROUND((SUM(valuation_score * weight) / NULLIF(SUM(CASE WHEN valuation_score IS NOT NULL THEN weight END), 0))::numeric, 2) AS valuation_score,
        ROUND((SUM(stock_cagr_1y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_1y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_1y,
        ROUND((SUM(stock_cagr_3y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_3y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_3y,
        ROUND((SUM(stock_cagr_5y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_5y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_5y,
        ROUND((SUM(stock_cagr_10y * weight) / NULLIF(SUM(CASE WHEN stock_cagr_10y IS NOT NULL THEN weight END), 0))::numeric, 2) AS cagr_10y
      FROM matched_stocks
      GROUP BY fund_name
      HAVING COUNT(instrument_name) > 0
      ORDER BY overall_quality_score DESC NULLS LAST
    `;

    const result = await db.query(computeQuery);
    console.log(`✅ Computed scores for ${result.rows.length} funds`);

    // Upsert all results
    const upsertQuery = `
      INSERT INTO fund_quality_scores (
        fund_name, scheme_name, fund_house, scored_holdings, coverage_pct,
        overall_quality_score, piotroski_score, altman_z_score,
        financial_health_score, management_quality_score, earnings_quality_score,
        profitability_score, financial_strength_score, earnings_quality_score_v2,
        growth_score, valuation_score,
        cagr_1y, cagr_3y, cagr_5y, cagr_10y,
        calculated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, NOW())
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
        profitability_score = EXCLUDED.profitability_score,
        financial_strength_score = EXCLUDED.financial_strength_score,
        earnings_quality_score_v2 = EXCLUDED.earnings_quality_score_v2,
        growth_score = EXCLUDED.growth_score,
        valuation_score = EXCLUDED.valuation_score,
        cagr_1y = EXCLUDED.cagr_1y,
        cagr_3y = EXCLUDED.cagr_3y,
        cagr_5y = EXCLUDED.cagr_5y,
        cagr_10y = EXCLUDED.cagr_10y,
        calculated_at = NOW()
    `;

    for (const row of result.rows) {
      await db.query(upsertQuery, [
        row.fund_name, row.scheme_name, row.fund_house,
        row.scored_holdings, row.coverage_pct,
        row.overall_quality_score, row.piotroski_score, row.altman_z_score,
        row.financial_health_score, row.management_quality_score, row.earnings_quality_score,
        row.profitability_score, row.financial_strength_score, row.earnings_quality_score_v2,
        row.growth_score, row.valuation_score,
        row.cagr_1y, row.cagr_3y, row.cagr_5y, row.cagr_10y,
      ]);
    }

    console.log(`✅ Stored ${result.rows.length} fund ratings in DB`);
    res.json({
      success: true,
      fundsComputed: result.rows.length,
      calculatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error refreshing fund ratings:', error);
    res.status(500).json({ error: 'Failed to refresh fund ratings' });
  }
}
