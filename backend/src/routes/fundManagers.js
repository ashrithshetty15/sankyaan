import db from '../db.js';

/**
 * GET /api/fund-managers
 * Returns fund managers ranked by average portfolio quality score.
 * Splits semicolon-delimited fund_manager field to handle co-managed funds.
 */
export async function getFundManagers(req, res) {
  try {
    const result = await db.query(`
      WITH manager_split AS (
        SELECT
          TRIM(unnest(string_to_array(fund_manager, ';'))) AS manager_name,
          fund_house, fund_name, scheme_name,
          overall_quality_score, piotroski_score, altman_z_score,
          profitability_score, financial_strength_score,
          earnings_quality_score_v2, growth_score, valuation_score,
          cagr_1y, cagr_3y, cagr_5y
        FROM fund_quality_scores
        WHERE fund_manager IS NOT NULL
          AND overall_quality_score IS NOT NULL
          AND coverage_pct >= 50
      )
      SELECT
        manager_name,
        COUNT(*)::integer AS fund_count,
        ARRAY_AGG(DISTINCT fund_house ORDER BY fund_house) AS fund_houses,
        json_agg(json_build_object(
          'fundName', fund_name,
          'schemeName', scheme_name,
          'fundHouse', fund_house,
          'qualityScore', overall_quality_score,
          'cagr1y', cagr_1y,
          'cagr3y', cagr_3y,
          'cagr5y', cagr_5y
        ) ORDER BY overall_quality_score DESC) AS funds,
        ROUND(AVG(overall_quality_score)::numeric, 1) AS avg_quality,
        ROUND(AVG(piotroski_score)::numeric, 1) AS avg_piotroski,
        ROUND(AVG(altman_z_score)::numeric, 2) AS avg_altman_z,
        ROUND(AVG(cagr_1y)::numeric, 1) AS avg_cagr_1y,
        ROUND(AVG(cagr_3y)::numeric, 1) AS avg_cagr_3y,
        ROUND(AVG(cagr_5y)::numeric, 1) AS avg_cagr_5y,
        ROUND(AVG(profitability_score)::numeric, 1) AS avg_profitability,
        ROUND(AVG(financial_strength_score)::numeric, 1) AS avg_financial_strength,
        ROUND(AVG(earnings_quality_score_v2)::numeric, 1) AS avg_earnings_quality,
        ROUND(AVG(growth_score)::numeric, 1) AS avg_growth,
        ROUND(AVG(valuation_score)::numeric, 1) AS avg_valuation
      FROM manager_split
      WHERE manager_name != ''
      GROUP BY manager_name
      ORDER BY AVG(overall_quality_score) DESC NULLS LAST
    `);

    const managers = result.rows.map((row, idx) => ({
      rank: idx + 1,
      managerName: row.manager_name,
      fundCount: row.fund_count,
      fundHouses: row.fund_houses,
      funds: row.funds,
      avgQuality: parseFloat(row.avg_quality),
      avgPiotroski: parseFloat(row.avg_piotroski),
      avgAltmanZ: parseFloat(row.avg_altman_z),
      avgCagr1y: row.avg_cagr_1y != null ? parseFloat(row.avg_cagr_1y) : null,
      avgCagr3y: row.avg_cagr_3y != null ? parseFloat(row.avg_cagr_3y) : null,
      avgCagr5y: row.avg_cagr_5y != null ? parseFloat(row.avg_cagr_5y) : null,
      avgProfitability: parseFloat(row.avg_profitability),
      avgFinancialStrength: parseFloat(row.avg_financial_strength),
      avgEarningsQuality: parseFloat(row.avg_earnings_quality),
      avgGrowth: parseFloat(row.avg_growth),
      avgValuation: parseFloat(row.avg_valuation),
    }));

    res.json({ managers, totalManagers: managers.length });
  } catch (error) {
    console.error('Error fetching fund managers:', error);
    res.status(500).json({ error: 'Failed to fetch fund managers' });
  }
}
