import db from '../db.js';

/**
 * Calculate aggregate forensic scores for a mutual fund portfolio
 * based on its equity holdings and their individual quality scores
 */
export async function calculatePortfolioForensics(req, res) {
  try {
    const { ticker } = req.params;

    // Get all holdings for this mutual fund with linked stock data
    const holdingsResult = await db.query(`
      SELECT
        mp.instrument_name,
        mp.percent_nav as portfolio_percentage,
        mp.market_value_lacs,
        mp.stock_id,
        s.symbol,
        s.company_name,
        s.sector,
        s.industry,
        qs.overall_quality_score,
        qs.financial_health_score,
        qs.management_quality_score,
        qs.earnings_quality_score,
        qs.piotroski_score,
        qs.altman_z_score,
        qs.profitability_score,
        qs.financial_strength_score,
        qs.earnings_quality_score_v2,
        qs.growth_score,
        qs.valuation_score,
        sf.net_margin,
        sf.roe_pct as roe,
        sf.roce_pct as roce,
        sf.debt_to_equity,
        sf.current_ratio,
        src.cagr_1y,
        src.cagr_3y,
        src.cagr_5y,
        src.cagr_10y
      FROM mutualfund_portfolio mp
      LEFT JOIN stocks s ON s.id = mp.stock_id
      LEFT JOIN stock_quality_scores qs ON qs.stock_id = mp.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      LEFT JOIN stock_ratings_cache src ON src.symbol = s.symbol
      WHERE mp.fund_name = $1
        AND mp.percent_nav > 0
      ORDER BY mp.market_value_lacs DESC
    `, [ticker]);

    if (holdingsResult.rows.length === 0) {
      return res.json({
        ticker,
        totalHoldings: 0,
        scoredHoldings: 0,
        coveragePercentage: 0,
        scores: null,
        message: 'No holdings found for this fund'
      });
    }

    const holdings = holdingsResult.rows;

    // Try to match holdings with stocks in our database
    let totalWeight = 0;
    let aggregateScores = {
      overall_quality_score: 0,
      financial_health_score: 0,
      management_quality_score: 0,
      earnings_quality_score: 0,
      piotroski_score: 0,
      altman_z_score: 0,
      profitability_score: 0,
      financial_strength_score: 0,
      earnings_quality_score_v2: 0,
      growth_score: 0,
      valuation_score: 0
    };

    let scoreCounts = {
      overall_quality_score: 0,
      financial_health_score: 0,
      management_quality_score: 0,
      earnings_quality_score: 0,
      piotroski_score: 0,
      altman_z_score: 0,
      profitability_score: 0,
      financial_strength_score: 0,
      earnings_quality_score_v2: 0,
      growth_score: 0,
      valuation_score: 0
    };

    // CAGR weighted aggregation
    let cagrSums = { cagr_1y: 0, cagr_3y: 0, cagr_5y: 0, cagr_10y: 0 };
    let cagrWeights = { cagr_1y: 0, cagr_3y: 0, cagr_5y: 0, cagr_10y: 0 };

    const holdingsWithScores = [];

    for (const holding of holdings) {
      const weight = holding.portfolio_percentage / 100;

      // Check if this holding is linked to a stock and has quality scores
      if (holding.stock_id && holding.overall_quality_score !== null) {
        holdingsWithScores.push({
          name: holding.instrument_name,
          symbol: holding.symbol,
          sector: holding.sector,
          industry: holding.industry,
          weight: holding.portfolio_percentage,
          scores: {
            overall_quality_score: holding.overall_quality_score,
            financial_health_score: holding.financial_health_score,
            management_quality_score: holding.management_quality_score,
            earnings_quality_score: holding.earnings_quality_score,
            piotroski_score: holding.piotroski_score,
            altman_z_score: holding.altman_z_score,
            profitability_score: holding.profitability_score,
            financial_strength_score: holding.financial_strength_score,
            earnings_quality_score_v2: holding.earnings_quality_score_v2,
            growth_score: holding.growth_score,
            valuation_score: holding.valuation_score
          },
          fundamentals: {
            net_margin: holding.net_margin,
            roe: holding.roe,
            roce: holding.roce,
            debt_to_equity: holding.debt_to_equity,
            current_ratio: holding.current_ratio
          }
        });

        totalWeight += weight;

        // Weighted aggregate scores
        if (holding.overall_quality_score !== null) {
          aggregateScores.overall_quality_score += holding.overall_quality_score * weight;
          scoreCounts.overall_quality_score += weight;
        }
        if (holding.financial_health_score !== null) {
          aggregateScores.financial_health_score += holding.financial_health_score * weight;
          scoreCounts.financial_health_score += weight;
        }
        if (holding.management_quality_score !== null) {
          aggregateScores.management_quality_score += holding.management_quality_score * weight;
          scoreCounts.management_quality_score += weight;
        }
        if (holding.earnings_quality_score !== null) {
          aggregateScores.earnings_quality_score += holding.earnings_quality_score * weight;
          scoreCounts.earnings_quality_score += weight;
        }
        if (holding.piotroski_score !== null) {
          aggregateScores.piotroski_score += holding.piotroski_score * weight;
          scoreCounts.piotroski_score += weight;
        }
        if (holding.altman_z_score !== null) {
          aggregateScores.altman_z_score += holding.altman_z_score * weight;
          scoreCounts.altman_z_score += weight;
        }
        // 5-pillar scores
        for (const key of ['profitability_score', 'financial_strength_score', 'earnings_quality_score_v2', 'growth_score', 'valuation_score']) {
          if (holding[key] !== null && holding[key] !== undefined) {
            aggregateScores[key] += parseFloat(holding[key]) * weight;
            scoreCounts[key] += weight;
          }
        }
      }

      // Accumulate CAGR (even for holdings without quality scores)
      for (const cagrKey of ['cagr_1y', 'cagr_3y', 'cagr_5y', 'cagr_10y']) {
        if (holding[cagrKey] != null) {
          const cagrVal = parseFloat(holding[cagrKey]);
          if (!isNaN(cagrVal)) {
            cagrSums[cagrKey] += cagrVal * weight;
            cagrWeights[cagrKey] += weight;
          }
        }
      }
    }

    // Normalize weighted scores
    const finalScores = {};
    for (const key in aggregateScores) {
      if (scoreCounts[key] > 0) {
        finalScores[key] = Math.round(aggregateScores[key] / scoreCounts[key] * 100) / 100;
      } else {
        finalScores[key] = null;
      }
    }

    // Compute weighted average CAGR from individual stocks (fallback)
    const stockCagr = {};
    for (const cagrKey of ['cagr_1y', 'cagr_3y', 'cagr_5y', 'cagr_10y']) {
      stockCagr[cagrKey] = cagrWeights[cagrKey] > 0
        ? Math.round((cagrSums[cagrKey] / cagrWeights[cagrKey]) * 100) / 100
        : null;
    }

    // Prefer fund-level CAGR from mfapi.in NAV data (more accurate)
    let fundCagr = {};
    try {
      const fundCagrResult = await db.query(`
        SELECT cagr_1y, cagr_3y, cagr_5y, cagr_10y, fund_manager, fund_start_date
        FROM fund_quality_scores
        WHERE fund_name = $1
      `, [ticker]);
      fundCagr = fundCagrResult.rows[0] || {};
    } catch (e) {
      // Table may not exist yet on production — fall back to stock CAGR
    }

    const cagr = {
      cagr_1y: fundCagr.cagr_1y != null ? parseFloat(fundCagr.cagr_1y) : stockCagr.cagr_1y,
      cagr_3y: fundCagr.cagr_3y != null ? parseFloat(fundCagr.cagr_3y) : stockCagr.cagr_3y,
      cagr_5y: fundCagr.cagr_5y != null ? parseFloat(fundCagr.cagr_5y) : stockCagr.cagr_5y,
      cagr_10y: fundCagr.cagr_10y != null ? parseFloat(fundCagr.cagr_10y) : stockCagr.cagr_10y,
    };

    res.json({
      ticker,
      totalHoldings: holdings.length,
      scoredHoldings: holdingsWithScores.length,
      coveragePercentage: (totalWeight * 100).toFixed(2),
      scores: finalScores,
      cagr,
      fundManager: fundCagr.fund_manager || null,
      fundStartDate: fundCagr.fund_start_date || null,
      topHoldings: holdingsWithScores.slice(0, 10),
      calculatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calculating portfolio forensics:', error);
    res.status(500).json({ error: 'Failed to calculate portfolio forensics' });
  }
}
