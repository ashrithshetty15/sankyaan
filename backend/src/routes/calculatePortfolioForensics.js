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
        sf.net_margin,
        sf.roe_pct as roe,
        sf.roce_pct as roce,
        sf.debt_to_equity,
        sf.current_ratio
      FROM mutualfund_portfolio mp
      LEFT JOIN stocks s ON s.id = mp.stock_id
      LEFT JOIN stock_quality_scores qs ON qs.stock_id = mp.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
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
      altman_z_score: 0
    };

    let scoreCounts = {
      overall_quality_score: 0,
      financial_health_score: 0,
      management_quality_score: 0,
      earnings_quality_score: 0,
      piotroski_score: 0,
      altman_z_score: 0
    };

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
            altman_z_score: holding.altman_z_score
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

    res.json({
      ticker,
      totalHoldings: holdings.length,
      scoredHoldings: holdingsWithScores.length,
      coveragePercentage: (totalWeight * 100).toFixed(2),
      scores: finalScores,
      topHoldings: holdingsWithScores.slice(0, 10),
      calculatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calculating portfolio forensics:', error);
    res.status(500).json({ error: 'Failed to calculate portfolio forensics' });
  }
}
