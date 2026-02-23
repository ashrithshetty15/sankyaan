import db from '../db.js';

/**
 * GET /api/portfolio-overlap?tickers=Fund1,Fund2,...,Fund5
 * Detect stock overlap across 2-5 mutual funds.
 * Returns per-fund summaries, all-funds overlap, pairwise overlap, unique holdings, and diversification score.
 */
export async function getPortfolioOverlap(req, res) {
  try {
    const { tickers } = req.query;
    if (!tickers) {
      return res.status(400).json({ error: 'tickers query param required (comma-separated fund names)' });
    }

    const fundNames = tickers.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
    if (fundNames.length < 2) {
      return res.status(400).json({ error: 'At least 2 fund names required' });
    }

    // Fetch equity holdings for all funds in parallel
    const holdingsResults = await Promise.all(
      fundNames.map(fundName =>
        db.query(`
          SELECT mp.instrument_name, mp.percent_nav, mp.stock_id, s.symbol, s.sector
          FROM mutualfund_portfolio mp
          LEFT JOIN stocks s ON s.id = mp.stock_id
          WHERE mp.fund_name = $1 AND mp.percent_nav > 0 AND mp.stock_id IS NOT NULL
          ORDER BY mp.percent_nav DESC
        `, [fundName])
      )
    );

    // Build per-fund data structures
    const funds = fundNames.map((fundName, i) => {
      const holdings = holdingsResults[i].rows;
      const stockIdSet = new Set();
      const holdingsMap = {};

      for (const h of holdings) {
        stockIdSet.add(h.stock_id);
        holdingsMap[h.stock_id] = {
          name: h.instrument_name,
          sector: h.sector || 'Other',
          symbol: h.symbol || '',
          weight: parseFloat(h.percent_nav)
        };
      }

      return { fundName, stockIdSet, holdingsMap, equityCount: holdings.length };
    });

    // All-funds overlap: stocks present in EVERY selected fund
    const allFundsCommonIds = [...funds[0].stockIdSet].filter(id =>
      funds.every(f => f.stockIdSet.has(id))
    );
    const allFundsCommonSet = new Set(allFundsCommonIds);

    // Build enriched common stocks with per-fund weights
    const allFundsStocks = allFundsCommonIds.map(id => {
      const weights = {};
      let name = '', sector = '';
      for (const fund of funds) {
        const h = fund.holdingsMap[id];
        if (h) {
          name = h.name;
          sector = h.sector;
          weights[fund.fundName] = h.weight;
        }
      }
      const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);
      return { stockId: id, name, sector, weights, totalWeight };
    }).sort((a, b) => b.totalWeight - a.totalWeight);

    // Pairwise overlap (only exclusive — stocks shared between pair but NOT in all-funds set)
    const pairwiseOverlap = [];
    const pairwiseMatrix = {};

    for (let i = 0; i < funds.length; i++) {
      for (let j = i + 1; j < funds.length; j++) {
        const fi = funds[i], fj = funds[j];

        // All stocks shared between this pair (including all-funds common)
        const allPairIds = [...fi.stockIdSet].filter(id => fj.stockIdSet.has(id));
        const pairOverlapPct = Math.round(
          (allPairIds.length / Math.min(fi.equityCount, fj.equityCount)) * 100 * 10
        ) / 10;

        // Stocks exclusive to this pair (not in all-funds common)
        const exclusiveIds = allPairIds.filter(id => !allFundsCommonSet.has(id));
        const exclusiveStocks = exclusiveIds.map(id => {
          const weights = {};
          let name = '', sector = '';
          const hi = fi.holdingsMap[id];
          const hj = fj.holdingsMap[id];
          if (hi) { name = hi.name; sector = hi.sector; weights[fi.fundName] = hi.weight; }
          if (hj) { name = hj.name; sector = hj.sector; weights[fj.fundName] = hj.weight; }
          return { name, sector, weights };
        }).sort((a, b) => {
          const aT = Object.values(a.weights).reduce((s, v) => s + v, 0);
          const bT = Object.values(b.weights).reduce((s, v) => s + v, 0);
          return bT - aT;
        });

        pairwiseOverlap.push({
          fundA: fi.fundName,
          fundB: fj.fundName,
          overlapPct: pairOverlapPct,
          exclusiveStocks: exclusiveStocks.slice(0, 15),
          exclusiveCount: exclusiveIds.length
        });

        // Build matrix
        if (!pairwiseMatrix[fi.fundName]) pairwiseMatrix[fi.fundName] = {};
        pairwiseMatrix[fi.fundName][fj.fundName] = pairOverlapPct;
      }
    }

    // Unique holdings: stocks in exactly one fund
    const allStockIds = new Set();
    for (const f of funds) {
      for (const id of f.stockIdSet) allStockIds.add(id);
    }

    const uniqueHoldings = funds.map(f => {
      const uniqueStocks = [...f.stockIdSet]
        .filter(id => {
          let count = 0;
          for (const other of funds) {
            if (other.stockIdSet.has(id)) count++;
          }
          return count === 1;
        })
        .map(id => f.holdingsMap[id])
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map(h => ({ name: h.name, sector: h.sector, weight: h.weight }));

      return { fundName: f.fundName, stocks: uniqueStocks };
    });

    // Per-fund overlap stats
    const fundsResponse = funds.map(f => {
      const commonWeight = allFundsCommonIds.reduce((sum, id) => {
        const h = f.holdingsMap[id];
        return sum + (h ? h.weight : 0);
      }, 0);
      const overlapPct = f.equityCount > 0
        ? Math.round((allFundsCommonIds.length / f.equityCount) * 100 * 10) / 10
        : 0;

      return {
        fundName: f.fundName,
        equityCount: f.equityCount,
        overlapCount: allFundsCommonIds.length,
        overlapPct,
        commonWeight: Math.round(commonWeight * 10) / 10
      };
    });

    // Diversification score
    const avgOverlapPct = fundsResponse.reduce((s, f) => s + f.overlapPct, 0) / fundsResponse.length;
    const diversificationScore = Math.round(100 - avgOverlapPct);

    res.json({
      funds: fundsResponse,
      allFundsOverlap: {
        stocks: allFundsStocks,
        count: allFundsCommonIds.length
      },
      pairwiseOverlap: funds.length >= 3 ? pairwiseOverlap : [],
      uniqueHoldings,
      stats: {
        overallOverlapPct: Math.round(avgOverlapPct * 10) / 10,
        diversificationScore,
        pairwiseMatrix
      }
    });

  } catch (error) {
    console.error('Error computing portfolio overlap:', error);
    res.status(500).json({ error: 'Failed to compute portfolio overlap' });
  }
}
