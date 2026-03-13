import db from './src/db.js';

async function debugCANSLIM() {
  const r = await db.query(`
    SELECT
      s.id, s.symbol, s.market_cap,
      sf.net_income, sf.net_margin, sf.roe, sf.roa,
      sf.operating_margin, sf.current_ratio,
      sp.fii_holding, sp.dii_holding
    FROM stocks s
    INNER JOIN stock_fundamentals sf ON s.id = sf.stock_id
    LEFT JOIN shareholding_pattern sp ON s.id = sp.stock_id
    WHERE s.symbol = 'TCS.NS'
    ORDER BY sf.fiscal_year DESC, sp.date DESC
    LIMIT 1
  `);

  console.log('Query result for TCS.NS:');
  console.log(JSON.stringify(r.rows[0], null, 2));

  // Now test CANSLIM calculation
  const row = r.rows[0];
  const shareholding = {
    fii_holding: row.fii_holding,
    dii_holding: row.dii_holding
  };

  console.log('\nShareholding object:');
  console.log(JSON.stringify(shareholding, null, 2));

  // Manual CANSLIM calculation
  let score = 0;
  let weights = 0;

  // C = Current Earnings (20%)
  if (row.net_income && row.net_income > 0 && row.net_margin) {
    const earningsScore = Math.max(0, Math.min(parseFloat(row.net_margin) / 15, 1)) * 100;
    console.log(`\nC (Current Earnings): netMargin=${row.net_margin}, earningsScore=${earningsScore.toFixed(2)}`);
    score += earningsScore * 0.2;
    weights += 0.2;
  }

  // A = Annual (ROE)
  if (row.roe && row.roe > 0) {
    const annualScore = Math.max(0, Math.min(parseFloat(row.roe) / 25, 1)) * 100;
    console.log(`A (Annual/ROE): roe=${row.roe}, annualScore=${annualScore.toFixed(2)}`);
    score += annualScore * 0.2;
    weights += 0.2;
  }

  // N = New (Operating Margin)
  if (row.operating_margin && row.operating_margin > 0) {
    const innovationScore = Math.max(0, Math.min(parseFloat(row.operating_margin) / 20, 1)) * 100;
    console.log(`N (Innovation/OpMargin): operating_margin=${row.operating_margin}, innovationScore=${innovationScore.toFixed(2)}`);
    score += innovationScore * 0.1;
    weights += 0.1;
  }

  // S = Supply/Demand (Market Cap)
  if (row.market_cap && row.market_cap > 0) {
    const capInBillions = parseFloat(row.market_cap) / 1000000000;
    let supplyScore = 0;
    if (capInBillions > 1000) supplyScore = 100;
    else if (capInBillions > 100) supplyScore = 75;
    else if (capInBillions > 10) supplyScore = 50;
    else if (capInBillions > 1) supplyScore = 25;
    console.log(`S (Supply/Demand): marketCap=${row.market_cap}, capInB=${capInBillions.toFixed(2)}, supplyScore=${supplyScore}`);
    score += supplyScore * 0.1;
    weights += 0.1;
  }

  // L = Leader (ROA)
  if (row.roa && row.roa > 0) {
    const leaderScore = Math.max(0, Math.min(parseFloat(row.roa) / 15, 1)) * 100;
    console.log(`L (Leader/ROA): roa=${row.roa}, leaderScore=${leaderScore.toFixed(2)}`);
    score += leaderScore * 0.15;
    weights += 0.15;
  }

  // I = Institutional
  if (shareholding.fii_holding !== null && shareholding.dii_holding !== null) {
    const institutional = parseFloat(shareholding.fii_holding || 0) + parseFloat(shareholding.dii_holding || 0);
    const instScore = Math.max(0, Math.min(institutional / 50, 1)) * 100;
    console.log(`I (Institutional): FII=${shareholding.fii_holding}, DII=${shareholding.dii_holding}, total=${institutional.toFixed(2)}, instScore=${instScore.toFixed(2)}`);
    score += instScore * 0.15;
    weights += 0.15;
  }

  // M = Market (Current Ratio)
  if (row.current_ratio) {
    const marketScore = Math.max(0, Math.min(parseFloat(row.current_ratio) / 2, 1)) * 100;
    console.log(`M (Market/CurrentRatio): current_ratio=${row.current_ratio}, marketScore=${marketScore.toFixed(2)}`);
    score += marketScore * 0.1;
    weights += 0.1;
  }

  const result = weights > 0 ? Math.round(score / weights) : null;
  console.log(`\n=== RESULT ===`);
  console.log(`Total score: ${score.toFixed(2)}`);
  console.log(`Total weights: ${weights.toFixed(2)}`);
  console.log(`CANSLIM Score: ${result}`);

  process.exit(0);
}

debugCANSLIM();
