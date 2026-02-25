import db from '../db.js';

/**
 * GET /api/fund-screener/sectors
 * Returns distinct sectors from the stocks table for the sector filter dropdown.
 */
export async function getScreenerSectors(req, res) {
  try {
    const result = await db.query(`
      SELECT s.sector AS name, COUNT(DISTINCT mp.fund_name)::integer AS fund_count
      FROM mutualfund_portfolio mp
      JOIN stocks s ON s.id = mp.stock_id
      WHERE s.sector IS NOT NULL AND s.sector != ''
      GROUP BY s.sector
      ORDER BY fund_count DESC
    `);
    res.json({ sectors: result.rows });
  } catch (error) {
    console.error('Error fetching screener sectors:', error);
    res.status(500).json({ error: 'Failed to fetch sectors' });
  }
}

/**
 * GET /api/fund-screener
 * Advanced fund screener with server-side filtering.
 * Query params: sector, stockId, minAum, minQuality, maxExpenseRatio,
 *               minCagr1y, minCagr3y, minCagr5y, sortBy, sortDir
 */
export async function fundScreener(req, res) {
  try {
    const {
      sector, stockId, minAum, fundHouse,
      minQuality, maxExpenseRatio,
      minCagr1y, minCagr3y, minCagr5y,
      sortBy = 'overall_quality_score', sortDir = 'desc'
    } = req.query;

    // Whitelist sortable columns to prevent SQL injection
    const SORTABLE_COLUMNS = {
      overall_quality_score: 'fqs.overall_quality_score',
      profitability_score: 'fqs.profitability_score',
      financial_strength_score: 'fqs.financial_strength_score',
      earnings_quality_score_v2: 'fqs.earnings_quality_score_v2',
      growth_score: 'fqs.growth_score',
      valuation_score: 'fqs.valuation_score',
      cagr_1y: 'fqs.cagr_1y',
      cagr_3y: 'fqs.cagr_3y',
      cagr_5y: 'fqs.cagr_5y',
      expense_ratio: 'fqs.expense_ratio',
      aum_crores: 'fa.aum_crores',
      sector_exposure: 'se.exposure',
      stock_exposure: 'ste.exposure',
      fund_house: 'fqs.fund_house',
      scheme_name: 'fqs.scheme_name',
    };

    const safeSort = SORTABLE_COLUMNS[sortBy] || 'fqs.overall_quality_score';
    const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    // Build dynamic CTEs and WHERE clauses
    const ctes = [];
    const joins = [];
    const wheres = ['fqs.overall_quality_score IS NOT NULL'];
    const params = [];
    let paramIdx = 1;

    // Always include fund AUM CTE
    ctes.push(`
      fund_aum AS (
        SELECT fund_name,
          ROUND(SUM(market_value_lacs)::numeric / 100, 0) AS aum_crores,
          COUNT(DISTINCT instrument_name)::integer AS holding_count
        FROM mutualfund_portfolio
        GROUP BY fund_name
      )
    `);
    joins.push('LEFT JOIN fund_aum fa ON fa.fund_name = fqs.fund_name');

    // AUM filter
    if (minAum) {
      wheres.push(`fa.aum_crores >= $${paramIdx}`);
      params.push(parseFloat(minAum));
      paramIdx++;
    }

    // Sector exposure CTE (only if sector filter active)
    // Supports comma-separated values; matches both sector and industry columns
    if (sector) {
      const sectorList = sector.split(',').map(s => s.trim()).filter(Boolean);
      ctes.push(`
        sector_exposure AS (
          SELECT mp.fund_name, ROUND(SUM(mp.percent_nav)::numeric, 2) AS exposure
          FROM mutualfund_portfolio mp
          JOIN stocks s ON s.id = mp.stock_id
          WHERE s.sector = ANY($${paramIdx}::text[]) OR s.industry = ANY($${paramIdx}::text[])
          GROUP BY mp.fund_name
        )
      `);
      params.push(sectorList);
      paramIdx++;
      joins.push('JOIN sector_exposure se ON se.fund_name = fqs.fund_name');
    }

    // Stock exposure CTE (only if stockId filter active)
    if (stockId) {
      ctes.push(`
        stock_exposure AS (
          SELECT mp.fund_name, mp.percent_nav AS exposure, mp.instrument_name
          FROM mutualfund_portfolio mp
          WHERE mp.stock_id = $${paramIdx}
        )
      `);
      params.push(parseInt(stockId));
      paramIdx++;
      joins.push('JOIN stock_exposure ste ON ste.fund_name = fqs.fund_name');
    }

    // Fund house filter
    if (fundHouse) {
      wheres.push(`fqs.fund_house = $${paramIdx}`);
      params.push(fundHouse);
      paramIdx++;
    }

    // Quality filter
    if (minQuality) {
      wheres.push(`fqs.overall_quality_score >= $${paramIdx}`);
      params.push(parseFloat(minQuality));
      paramIdx++;
    }

    // Expense ratio filter
    if (maxExpenseRatio) {
      wheres.push(`fqs.expense_ratio IS NOT NULL AND fqs.expense_ratio <= $${paramIdx}`);
      params.push(parseFloat(maxExpenseRatio));
      paramIdx++;
    }

    // CAGR filters
    if (minCagr1y) {
      wheres.push(`fqs.cagr_1y >= $${paramIdx}`);
      params.push(parseFloat(minCagr1y));
      paramIdx++;
    }
    if (minCagr3y) {
      wheres.push(`fqs.cagr_3y >= $${paramIdx}`);
      params.push(parseFloat(minCagr3y));
      paramIdx++;
    }
    if (minCagr5y) {
      wheres.push(`fqs.cagr_5y >= $${paramIdx}`);
      params.push(parseFloat(minCagr5y));
      paramIdx++;
    }

    // Build SELECT columns
    const selectCols = [
      'fqs.fund_name', 'fqs.scheme_name', 'fqs.fund_house', 'fqs.fund_manager',
      'fqs.overall_quality_score', 'fqs.profitability_score', 'fqs.financial_strength_score',
      'fqs.earnings_quality_score_v2', 'fqs.growth_score', 'fqs.valuation_score',
      'fqs.cagr_1y', 'fqs.cagr_3y', 'fqs.cagr_5y', 'fqs.expense_ratio',
      'fa.aum_crores', 'fa.holding_count',
    ];
    if (sector) selectCols.push('se.exposure AS sector_exposure');
    if (stockId) selectCols.push('ste.exposure AS stock_exposure', 'ste.instrument_name AS target_stock');

    const sql = `
      WITH ${ctes.join(',\n')}
      SELECT ${selectCols.join(', ')}
      FROM fund_quality_scores fqs
      ${joins.join('\n')}
      WHERE ${wheres.join(' AND ')}
      ORDER BY ${safeSort} ${safeDir} NULLS LAST
    `;

    const result = await db.query(sql, params);

    const funds = result.rows.map(r => ({
      fundName: r.fund_name,
      schemeName: r.scheme_name,
      fundHouse: r.fund_house,
      fundManager: r.fund_manager,
      qualityScore: r.overall_quality_score != null ? parseFloat(r.overall_quality_score) : null,
      profitabilityScore: r.profitability_score != null ? parseFloat(r.profitability_score) : null,
      financialStrengthScore: r.financial_strength_score != null ? parseFloat(r.financial_strength_score) : null,
      earningsQualityScore: r.earnings_quality_score_v2 != null ? parseFloat(r.earnings_quality_score_v2) : null,
      growthScore: r.growth_score != null ? parseFloat(r.growth_score) : null,
      valuationScore: r.valuation_score != null ? parseFloat(r.valuation_score) : null,
      cagr1y: r.cagr_1y != null ? parseFloat(r.cagr_1y) : null,
      cagr3y: r.cagr_3y != null ? parseFloat(r.cagr_3y) : null,
      cagr5y: r.cagr_5y != null ? parseFloat(r.cagr_5y) : null,
      expenseRatio: r.expense_ratio != null ? parseFloat(r.expense_ratio) : null,
      aumCrores: r.aum_crores != null ? parseFloat(r.aum_crores) : null,
      holdingCount: r.holding_count || 0,
      ...(sector && { sectorExposure: r.sector_exposure != null ? parseFloat(r.sector_exposure) : null }),
      ...(stockId && {
        stockExposure: r.stock_exposure != null ? parseFloat(r.stock_exposure) : null,
        targetStock: r.target_stock || null,
      }),
    }));

    res.json({
      funds,
      totalCount: funds.length,
      filters: {
        ...(sector && { sector }),
        ...(stockId && { stockId: parseInt(stockId) }),
        ...(minAum && { minAum: parseFloat(minAum) }),
        ...(minQuality && { minQuality: parseFloat(minQuality) }),
        ...(maxExpenseRatio && { maxExpenseRatio: parseFloat(maxExpenseRatio) }),
        ...(minCagr1y && { minCagr1y: parseFloat(minCagr1y) }),
        ...(minCagr3y && { minCagr3y: parseFloat(minCagr3y) }),
        ...(minCagr5y && { minCagr5y: parseFloat(minCagr5y) }),
        ...(fundHouse && { fundHouse }),
      },
    });
  } catch (error) {
    console.error('Error in fund screener:', error);
    res.status(500).json({ error: 'Failed to screen funds' });
  }
}
