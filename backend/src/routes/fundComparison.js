import db from '../db.js';

/**
 * GET /api/fund-comparison?tickers=Fund1,Fund2,Fund3
 * Compare 2-3 mutual funds side-by-side.
 * Returns scores, CAGR, sectors, top holdings, and overlap data.
 */
export async function compareFunds(req, res) {
  try {
    const { tickers } = req.query;
    if (!tickers) {
      return res.status(400).json({ error: 'tickers query param required (comma-separated fund names)' });
    }

    const fundNames = tickers.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
    if (fundNames.length < 2) {
      return res.status(400).json({ error: 'At least 2 fund names required' });
    }

    const funds = [];

    for (const fundName of fundNames) {
      // Get scores + CAGR + fund manager from fund_quality_scores
      const scoresResult = await db.query(`
        SELECT fund_name, scheme_name, fund_house, fund_manager,
               overall_quality_score, piotroski_score, altman_z_score,
               profitability_score, financial_strength_score,
               earnings_quality_score_v2, growth_score, valuation_score,
               cagr_1y, cagr_3y, cagr_5y, cagr_10y,
               scored_holdings, coverage_pct
        FROM fund_quality_scores
        WHERE fund_name = $1
      `, [fundName]);

      const scores = scoresResult.rows[0] || {};

      // Get holdings with sector info
      const holdingsResult = await db.query(`
        SELECT mp.instrument_name, mp.percent_nav, mp.stock_id,
               s.symbol, s.sector
        FROM mutualfund_portfolio mp
        LEFT JOIN stocks s ON s.id = mp.stock_id
        WHERE mp.fund_name = $1 AND mp.percent_nav > 0
        ORDER BY mp.percent_nav DESC
      `, [fundName]);

      const holdings = holdingsResult.rows;

      // Sector breakdown
      const sectorMap = {};
      for (const h of holdings) {
        const sec = h.sector || 'Other';
        sectorMap[sec] = (sectorMap[sec] || 0) + parseFloat(h.percent_nav || 0);
      }
      const sectors = Object.entries(sectorMap)
        .map(([sector, percentage]) => ({ sector, percentage: Math.round(percentage * 100) / 100 }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 8);

      // Top 10 holdings
      const topHoldings = holdings.slice(0, 10).map(h => ({
        name: h.instrument_name,
        percentage: parseFloat(h.percent_nav),
        symbol: h.symbol,
        stockId: h.stock_id
      }));

      funds.push({
        fundName: scores.fund_name || fundName,
        schemeName: scores.scheme_name || fundName,
        fundHouse: scores.fund_house || '',
        fundManager: scores.fund_manager || null,
        scoredHoldings: scores.scored_holdings,
        coveragePct: scores.coverage_pct,
        scores: {
          overall_quality_score: scores.overall_quality_score ? parseFloat(scores.overall_quality_score) : null,
          piotroski_score: scores.piotroski_score ? parseFloat(scores.piotroski_score) : null,
          altman_z_score: scores.altman_z_score ? parseFloat(scores.altman_z_score) : null,
          profitability_score: scores.profitability_score ? parseFloat(scores.profitability_score) : null,
          financial_strength_score: scores.financial_strength_score ? parseFloat(scores.financial_strength_score) : null,
          earnings_quality_score_v2: scores.earnings_quality_score_v2 ? parseFloat(scores.earnings_quality_score_v2) : null,
          growth_score: scores.growth_score ? parseFloat(scores.growth_score) : null,
          valuation_score: scores.valuation_score ? parseFloat(scores.valuation_score) : null,
        },
        cagr: {
          cagr_1y: scores.cagr_1y != null ? parseFloat(scores.cagr_1y) : null,
          cagr_3y: scores.cagr_3y != null ? parseFloat(scores.cagr_3y) : null,
          cagr_5y: scores.cagr_5y != null ? parseFloat(scores.cagr_5y) : null,
          cagr_10y: scores.cagr_10y != null ? parseFloat(scores.cagr_10y) : null,
        },
        sectors,
        topHoldings,
        _allStockIds: holdings.filter(h => h.stock_id).map(h => h.stock_id),
        _holdingsMap: Object.fromEntries(
          holdings.filter(h => h.stock_id).map(h => [h.stock_id, { name: h.instrument_name, percentage: parseFloat(h.percent_nav), symbol: h.symbol }])
        )
      });
    }

    // Compute holdings overlap across all funds
    const allStockIdSets = funds.map(f => new Set(f._allStockIds));
    const commonStockIds = [...allStockIdSets[0]].filter(id =>
      allStockIdSets.every(set => set.has(id))
    );

    const commonStocks = commonStockIds.map(id => {
      const weights = {};
      let name = '';
      let symbol = '';
      for (const fund of funds) {
        const h = fund._holdingsMap[id];
        if (h) {
          name = h.name;
          symbol = h.symbol || '';
          weights[fund.fundName] = h.percentage;
        }
      }
      return { name, symbol, weights };
    }).sort((a, b) => {
      const aTotal = Object.values(a.weights).reduce((s, v) => s + v, 0);
      const bTotal = Object.values(b.weights).reduce((s, v) => s + v, 0);
      return bTotal - aTotal;
    });

    // Overlap percentage: avg of (common / total) across funds
    const overlapPcts = funds.map(f =>
      f._allStockIds.length > 0
        ? (commonStockIds.length / f._allStockIds.length) * 100
        : 0
    );
    const overlapPercentage = Math.round(overlapPcts.reduce((a, b) => a + b, 0) / overlapPcts.length * 10) / 10;

    // Clean internal fields before sending
    const cleanFunds = funds.map(({ _allStockIds, _holdingsMap, ...rest }) => rest);

    res.json({
      funds: cleanFunds,
      overlap: {
        commonStocks: commonStocks.slice(0, 20),
        commonCount: commonStockIds.length,
        overlapPercentage
      }
    });

  } catch (error) {
    console.error('Error comparing funds:', error);
    res.status(500).json({ error: 'Failed to compare funds' });
  }
}
