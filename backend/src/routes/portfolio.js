import db from '../db.js';

/**
 * POST /api/portfolio
 * Add a fund to the user's portfolio.
 * Body: { fund_name, invested_amount }
 */
export async function addHolding(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });

    const { fund_name, invested_amount } = req.body;
    if (!fund_name) return res.status(400).json({ error: 'fund_name is required' });

    const result = await db.query(
      `INSERT INTO user_portfolio_holdings (user_id, fund_name, invested_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, fund_name) DO UPDATE SET invested_amount = EXCLUDED.invested_amount
       RETURNING id, fund_name, invested_amount`,
      [req.user.userId, fund_name, parseFloat(invested_amount) || 0]
    );

    res.json({ success: true, holding: result.rows[0] });
  } catch (error) {
    console.error('Error adding holding:', error);
    res.status(500).json({ error: 'Failed to add holding' });
  }
}

/**
 * GET /api/portfolio
 * Get all holdings for the logged-in user, joined with fund quality scores.
 */
export async function getPortfolio(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });

    const result = await db.query(`
      SELECT h.id, h.fund_name, h.invested_amount, h.created_at,
             fqs.scheme_name, fqs.fund_house, fqs.fund_manager,
             fqs.overall_quality_score, fqs.profitability_score,
             fqs.financial_strength_score, fqs.earnings_quality_score_v2,
             fqs.growth_score, fqs.valuation_score,
             fqs.cagr_1y, fqs.cagr_3y, fqs.cagr_5y,
             fqs.expense_ratio
      FROM user_portfolio_holdings h
      LEFT JOIN fund_quality_scores fqs ON fqs.fund_name = h.fund_name
      WHERE h.user_id = $1
      ORDER BY h.invested_amount DESC
    `, [req.user.userId]);

    const holdings = result.rows.map(r => ({
      id: r.id,
      fundName: r.fund_name,
      schemeName: r.scheme_name || r.fund_name,
      fundHouse: r.fund_house || '',
      fundManager: r.fund_manager || '',
      investedAmount: parseFloat(r.invested_amount) || 0,
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
      createdAt: r.created_at,
    }));

    const totalInvested = holdings.reduce((s, h) => s + h.investedAmount, 0);

    res.json({ holdings, totalInvested });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
}

/**
 * DELETE /api/portfolio/:id
 * Remove a holding from the user's portfolio.
 */
export async function deleteHolding(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });

    const { id } = req.params;
    await db.query(
      'DELETE FROM user_portfolio_holdings WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting holding:', error);
    res.status(500).json({ error: 'Failed to delete holding' });
  }
}

/**
 * GET /api/portfolio/analysis
 * Aggregated portfolio analysis: weighted quality score, sector exposure, stock overlap.
 */
export async function getPortfolioAnalysis(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });

    // Get user's fund names
    const holdingsResult = await db.query(
      'SELECT fund_name, invested_amount FROM user_portfolio_holdings WHERE user_id = $1',
      [req.user.userId]
    );

    if (holdingsResult.rows.length === 0) {
      return res.json({ sectors: [], overlap: [], weightedScore: null, fundCount: 0 });
    }

    const userFunds = holdingsResult.rows;
    const fundNames = userFunds.map(f => f.fund_name);
    const totalInvested = userFunds.reduce((s, f) => s + parseFloat(f.invested_amount), 0);

    // Calculate weighted quality score from fund_quality_scores
    const scoresResult = await db.query(`
      SELECT fund_name, overall_quality_score, cagr_1y, cagr_3y, cagr_5y
      FROM fund_quality_scores
      WHERE fund_name = ANY($1)
    `, [fundNames]);

    let weightedScore = 0;
    let weightedCagr1y = 0;
    let weightedCagr3y = 0;
    let weightedCagr5y = 0;
    let scoreWeight = 0;
    let cagrWeight1y = 0;
    let cagrWeight3y = 0;
    let cagrWeight5y = 0;

    for (const s of scoresResult.rows) {
      const fund = userFunds.find(f => f.fund_name === s.fund_name);
      if (!fund) continue;
      const w = parseFloat(fund.invested_amount) / (totalInvested || 1);

      if (s.overall_quality_score != null) {
        weightedScore += parseFloat(s.overall_quality_score) * w;
        scoreWeight += w;
      }
      if (s.cagr_1y != null) { weightedCagr1y += parseFloat(s.cagr_1y) * w; cagrWeight1y += w; }
      if (s.cagr_3y != null) { weightedCagr3y += parseFloat(s.cagr_3y) * w; cagrWeight3y += w; }
      if (s.cagr_5y != null) { weightedCagr5y += parseFloat(s.cagr_5y) * w; cagrWeight5y += w; }
    }

    // Sector exposure across all funds
    const sectorResult = await db.query(`
      SELECT s.sector, SUM(mp.percent_nav * h.invested_amount) AS weighted_exposure
      FROM user_portfolio_holdings h
      JOIN mutualfund_portfolio mp ON mp.fund_name = h.fund_name
      LEFT JOIN stocks s ON s.id = mp.stock_id
      WHERE h.user_id = $1 AND s.sector IS NOT NULL AND s.sector != ''
      GROUP BY s.sector
      ORDER BY weighted_exposure DESC
      LIMIT 12
    `, [req.user.userId]);

    const totalExposure = sectorResult.rows.reduce((s, r) => s + parseFloat(r.weighted_exposure), 0);
    const sectors = sectorResult.rows.map(r => ({
      sector: r.sector,
      percentage: totalExposure > 0
        ? Math.round(parseFloat(r.weighted_exposure) / totalExposure * 10000) / 100
        : 0,
    }));

    // Stock overlap: stocks held in 2+ of the user's funds
    const overlapResult = await db.query(`
      SELECT mp.stock_id, mp.instrument_name, s.symbol, mp.fund_name, mp.percent_nav
      FROM user_portfolio_holdings h
      JOIN mutualfund_portfolio mp ON mp.fund_name = h.fund_name
      LEFT JOIN stocks s ON s.id = mp.stock_id
      WHERE h.user_id = $1 AND mp.stock_id IS NOT NULL
      ORDER BY mp.stock_id, mp.fund_name
    `, [req.user.userId]);

    // Group by stock_id and find those in 2+ funds
    const stockFunds = {};
    for (const row of overlapResult.rows) {
      const key = row.stock_id;
      if (!stockFunds[key]) {
        stockFunds[key] = { name: row.instrument_name, symbol: row.symbol, funds: {} };
      }
      stockFunds[key].funds[row.fund_name] = parseFloat(row.percent_nav);
    }

    const overlap = Object.values(stockFunds)
      .filter(s => Object.keys(s.funds).length >= 2)
      .map(s => ({
        name: s.name,
        symbol: s.symbol,
        fundCount: Object.keys(s.funds).length,
        funds: s.funds,
        totalWeight: Object.values(s.funds).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 20);

    res.json({
      fundCount: fundNames.length,
      totalInvested,
      weightedScore: scoreWeight > 0 ? Math.round(weightedScore / scoreWeight * 10) / 10 : null,
      weightedCagr: {
        cagr1y: cagrWeight1y > 0 ? Math.round(weightedCagr1y / cagrWeight1y * 100) / 100 : null,
        cagr3y: cagrWeight3y > 0 ? Math.round(weightedCagr3y / cagrWeight3y * 100) / 100 : null,
        cagr5y: cagrWeight5y > 0 ? Math.round(weightedCagr5y / cagrWeight5y * 100) / 100 : null,
      },
      sectors,
      overlap,
      overlapCount: overlap.length,
    });
  } catch (error) {
    console.error('Error computing portfolio analysis:', error);
    res.status(500).json({ error: 'Failed to compute portfolio analysis' });
  }
}
