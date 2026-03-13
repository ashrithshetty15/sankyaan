import db from '../db.js';

/**
 * GET /api/stock-ratings
 * Serve pre-computed stock ratings from stock_ratings_cache table.
 * Returns results instantly (< 50ms).
 * Run `node compute_stock_ratings_cache.js` to populate/refresh the cache.
 */
export async function getStockRatings(req, res) {
  try {
    const { sector, minScore, maxScore } = req.query;

    let query = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY overall_quality_score DESC NULLS LAST) AS rank,
        symbol,
        company_name,
        sector,
        industry,
        market_cap,
        exchange,
        current_price,
        overall_quality_score,
        piotroski_score,
        magic_formula_score,
        canslim_score,
        altman_z_score,
        financial_health_score,
        management_quality_score,
        earnings_quality_score,
        profitability_score,
        financial_strength_score,
        earnings_quality_score_v2,
        growth_score,
        valuation_score,
        revenue_growth_yoy,
        eps_growth_yoy,
        calculated_date,
        cagr_1y,
        cagr_3y,
        cagr_5y,
        cagr_10y
      FROM stock_ratings_cache
      WHERE overall_quality_score IS NOT NULL
    `;
    const params = [];

    // Filter by sector if provided
    if (sector) {
      params.push(sector);
      query += ` AND sector = $${params.length}`;
    }

    // Filter by minimum score if provided
    if (minScore) {
      params.push(parseFloat(minScore));
      query += ` AND overall_quality_score >= $${params.length}`;
    }

    // Filter by maximum score if provided
    if (maxScore) {
      params.push(parseFloat(maxScore));
      query += ` AND overall_quality_score <= $${params.length}`;
    }

    query += ` ORDER BY overall_quality_score DESC NULLS LAST`;

    const result = await db.query(query, params);

    // Get the timestamp of the most recent calculation
    const lastUpdated = result.rows.length > 0
      ? result.rows[0].calculated_date
      : null;

    res.json({
      stocks: result.rows,
      totalStocks: result.rows.length,
      lastUpdated,
      source: 'cache'
    });

  } catch (error) {
    console.error('Error fetching stock ratings:', error);
    res.status(500).json({ error: 'Failed to fetch stock ratings' });
  }
}

/**
 * POST /api/stock-ratings/refresh
 * Recompute stock ratings cache from latest quality scores.
 * This is a fast operation (~1-2s for 2000 stocks) — can be called on-demand.
 */
export async function refreshStockRatings(req, res) {
  try {
    console.log('🔄 Refreshing stock ratings cache (triggered via API)...');

    // Query to get all stock data with latest quality scores, current price, and historical prices for CAGR
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
        qs.profitability_score,
        qs.financial_strength_score,
        qs.earnings_quality_score_v2,
        qs.growth_score,
        qs.valuation_score,
        qs.revenue_growth_yoy,
        qs.eps_growth_yoy,
        qs.calculated_date,
        (
          SELECT close
          FROM stock_prices
          WHERE stock_id = s.id
          ORDER BY date DESC
          LIMIT 1
        ) as current_price,
        (
          SELECT close FROM stock_prices
          WHERE stock_id = s.id AND date <= CURRENT_DATE - INTERVAL '1 year'
          ORDER BY date DESC LIMIT 1
        ) as price_1y_ago,
        (
          SELECT close FROM stock_prices
          WHERE stock_id = s.id AND date <= CURRENT_DATE - INTERVAL '3 years'
          ORDER BY date DESC LIMIT 1
        ) as price_3y_ago,
        (
          SELECT close FROM stock_prices
          WHERE stock_id = s.id AND date <= CURRENT_DATE - INTERVAL '5 years'
          ORDER BY date DESC LIMIT 1
        ) as price_5y_ago,
        (
          SELECT close FROM stock_prices
          WHERE stock_id = s.id AND date <= CURRENT_DATE - INTERVAL '10 years'
          ORDER BY date DESC LIMIT 1
        ) as price_10y_ago
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

    const result = await db.query(computeQuery);
    console.log(`✅ Found ${result.rows.length} stocks with quality scores`);

    // Clear existing cache
    await db.query('TRUNCATE TABLE stock_ratings_cache');

    // CAGR helper: ((current/old)^(1/years) - 1) * 100
    const computeCAGR = (currentPrice, oldPrice, years) => {
      if (!currentPrice || !oldPrice || oldPrice <= 0) return null;
      const cp = parseFloat(currentPrice);
      const op = parseFloat(oldPrice);
      if (isNaN(cp) || isNaN(op) || op <= 0) return null;
      return Math.round((Math.pow(cp / op, 1 / years) - 1) * 10000) / 100;
    };

    // Insert all rows into cache using a single multi-row insert for performance
    if (result.rows.length > 0) {
      const insertQuery = `
        INSERT INTO stock_ratings_cache (
          symbol, company_name, sector, industry, market_cap, exchange,
          current_price, overall_quality_score, piotroski_score,
          magic_formula_score, canslim_score, altman_z_score,
          financial_health_score, management_quality_score, earnings_quality_score,
          profitability_score, financial_strength_score, earnings_quality_score_v2,
          growth_score, valuation_score, revenue_growth_yoy, eps_growth_yoy,
          calculated_date, cached_at,
          cagr_1y, cagr_3y, cagr_5y, cagr_10y
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),$24,$25,$26,$27)
      `;

      for (const row of result.rows) {
        const cp = row.current_price;
        await db.query(insertQuery, [
          row.symbol,
          row.company_name,
          row.sector,
          row.industry,
          row.market_cap,
          row.exchange,
          cp,
          row.overall_quality_score,
          row.piotroski_score,
          row.magic_formula_score,
          row.canslim_score,
          row.altman_z_score,
          row.financial_health_score,
          row.management_quality_score,
          row.earnings_quality_score,
          row.profitability_score,
          row.financial_strength_score,
          row.earnings_quality_score_v2,
          row.growth_score,
          row.valuation_score,
          row.revenue_growth_yoy,
          row.eps_growth_yoy,
          row.calculated_date,
          computeCAGR(cp, row.price_1y_ago, 1),
          computeCAGR(cp, row.price_3y_ago, 3),
          computeCAGR(cp, row.price_5y_ago, 5),
          computeCAGR(cp, row.price_10y_ago, 10)
        ]);
      }
    }

    console.log(`✅ Cached ${result.rows.length} stock ratings`);
    res.json({
      success: true,
      stocksCached: result.rows.length,
      cachedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error refreshing stock ratings:', error);
    res.status(500).json({ error: 'Failed to refresh stock ratings' });
  }
}
