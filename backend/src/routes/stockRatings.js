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
        calculated_date
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

    const result = await db.query(computeQuery);
    console.log(`✅ Found ${result.rows.length} stocks with quality scores`);

    // Clear existing cache
    await db.query('TRUNCATE TABLE stock_ratings_cache');

    // Insert all rows into cache using a single multi-row insert for performance
    if (result.rows.length > 0) {
      const insertQuery = `
        INSERT INTO stock_ratings_cache (
          symbol, company_name, sector, industry, market_cap, exchange,
          current_price, overall_quality_score, piotroski_score,
          magic_formula_score, canslim_score, altman_z_score,
          financial_health_score, management_quality_score, earnings_quality_score,
          calculated_date, cached_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      `;

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
