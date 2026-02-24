import db from '../db.js';

/**
 * GET /api/fund-managers
 * Returns fund managers ranked by average portfolio quality score.
 * Splits semicolon-delimited fund_manager field to handle co-managed funds.
 */
export async function getFundManagers(req, res) {
  try {
    const result = await db.query(`
      WITH fund_aum AS (
        SELECT fund_name, ROUND(SUM(market_value_lacs)::numeric / 100, 0) AS aum_crores
        FROM mutualfund_portfolio
        GROUP BY fund_name
      ),
      manager_split AS (
        SELECT
          TRIM(unnest(string_to_array(fqs.fund_manager, ';'))) AS manager_name,
          fqs.fund_house, fqs.fund_name, fqs.scheme_name,
          fqs.overall_quality_score, fqs.piotroski_score, fqs.altman_z_score,
          fqs.profitability_score, fqs.financial_strength_score,
          fqs.earnings_quality_score_v2, fqs.growth_score, fqs.valuation_score,
          fqs.cagr_1y, fqs.cagr_3y, fqs.cagr_5y,
          fqs.fund_start_date,
          COALESCE(fa.aum_crores, 0) AS fund_aum_crores
        FROM fund_quality_scores fqs
        LEFT JOIN fund_aum fa ON fa.fund_name = fqs.fund_name
        WHERE fqs.fund_manager IS NOT NULL
          AND fqs.overall_quality_score IS NOT NULL
          AND fqs.coverage_pct >= 50
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
          'cagr5y', cagr_5y,
          'aumCrores', fund_aum_crores,
          'startDate', fund_start_date
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
        ROUND(AVG(valuation_score)::numeric, 1) AS avg_valuation,
        ROUND(SUM(fund_aum_crores)::numeric, 0) AS total_aum_crores
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
      totalAumCrores: parseFloat(row.total_aum_crores) || 0,
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
