import db from './src/db.js';

// Calculate quality scores for a single stock
async function calculateQualityScoresForStock(stockId) {
  try {
    console.log(`\n📊 Calculating quality scores for stock ID: ${stockId}\n`);

    const result = await db.query(
      `SELECT id, symbol, company_name FROM stocks WHERE id = $1`,
      [stockId]
    );

    if (result.rows.length === 0) {
      console.log('❌ Stock not found');
      process.exit(1);
    }

    const stock = result.rows[0];
    console.log(`Stock: ${stock.symbol} - ${stock.company_name}`);

    // Get fundamentals
    const fundamentals = await db.query(
      `SELECT * FROM stock_fundamentals WHERE stock_id = $1`,
      [stockId]
    );

    if (fundamentals.rows.length === 0) {
      console.log('❌ No fundamentals found for this stock');
      process.exit(1);
    }

    const f = fundamentals.rows[0];

    // Calculate Piotroski F-Score (0-9)
    let piotroskiScore = 0;

    // Profitability (4 points)
    if (parseFloat(f.net_income || 0) > 0) piotroskiScore++;
    if (parseFloat(f.roa || 0) > 0) piotroskiScore++;
    if (parseFloat(f.operating_cash_flow || 0) > 0) piotroskiScore++;
    if (parseFloat(f.operating_cash_flow || 0) > parseFloat(f.net_income || 0)) piotroskiScore++;

    // Leverage (3 points)
    if (parseFloat(f.debt_to_equity || 1) < 1) piotroskiScore++;
    if (parseFloat(f.current_ratio || 0) > 1) piotroskiScore++;
    // Assuming no new share issuance
    piotroskiScore++;

    // Operating Efficiency (2 points)
    if (parseFloat(f.net_margin || 0) > 10) piotroskiScore++;
    if (parseFloat(f.roe || 0) > 15) piotroskiScore++;

    // Calculate Altman Z-Score
    const workingCapital = parseFloat(f.total_assets || 0) * parseFloat(f.current_ratio || 1.5);
    const retainedEarnings = parseFloat(f.net_income || 0) * 0.6;
    const ebit = parseFloat(f.ebitda || 0) * 0.8;
    const marketCap = parseFloat(f.revenue || 0) * 2;
    const sales = parseFloat(f.revenue || 0);
    const totalAssets = parseFloat(f.total_assets || 0);

    let altmanZScore = 0;
    if (totalAssets > 0) {
      altmanZScore =
        1.2 * (workingCapital / totalAssets) +
        1.4 * (retainedEarnings / totalAssets) +
        3.3 * (ebit / totalAssets) +
        0.6 * (marketCap / parseFloat(f.total_debt || 1)) +
        1.0 * (sales / totalAssets);
    }

    // Component Scores (0-100)
    const financialHealthScore = Math.min(
      100,
      Math.max(
        0,
        (parseFloat(f.current_ratio || 1) / 2) * 30 +
          (1 - Math.min(1, parseFloat(f.debt_to_equity || 1))) * 40 +
          (altmanZScore / 5) * 30
      )
    );

    const managementQualityScore = Math.min(
      100,
      Math.max(
        0,
        (parseFloat(f.roe || 0) / 30) * 50 + (parseFloat(f.roce || 0) / 30) * 50
      )
    );

    const earningsQualityScore = Math.min(
      100,
      Math.max(
        0,
        (parseFloat(f.operating_margin || 10) / 25) * 40 +
          (parseFloat(f.net_margin || 10) / 25) * 40 +
          (piotroskiScore / 9) * 20
      )
    );

    // Overall Quality Score (weighted average)
    const overallQualityScore = Math.round(
      financialHealthScore * 0.3 +
        managementQualityScore * 0.4 +
        earningsQualityScore * 0.3
    );

    // Insert quality scores
    await db.query(
      `INSERT INTO stock_quality_scores (
        stock_id,
        piotroski_score,
        altman_z_score,
        overall_quality_score,
        financial_health_score,
        management_quality_score,
        earnings_quality_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (stock_id) DO UPDATE SET
        piotroski_score = EXCLUDED.piotroski_score,
        altman_z_score = EXCLUDED.altman_z_score,
        overall_quality_score = EXCLUDED.overall_quality_score,
        financial_health_score = EXCLUDED.financial_health_score,
        management_quality_score = EXCLUDED.management_quality_score,
        earnings_quality_score = EXCLUDED.earnings_quality_score`,
      [
        stockId,
        piotroskiScore,
        altmanZScore.toFixed(2),
        overallQualityScore,
        Math.round(financialHealthScore),
        Math.round(managementQualityScore),
        Math.round(earningsQualityScore),
      ]
    );

    console.log('\n✅ Quality Scores Calculated:');
    console.log(`   Overall Quality Score: ${overallQualityScore}/100`);
    console.log(`   Piotroski F-Score: ${piotroskiScore}/9`);
    console.log(`   Altman Z-Score: ${altmanZScore.toFixed(2)}`);
    console.log(`   Financial Health: ${Math.round(financialHealthScore)}/100`);
    console.log(`   Management Quality: ${Math.round(managementQualityScore)}/100`);
    console.log(`   Earnings Quality: ${Math.round(earningsQualityScore)}/100\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error calculating quality scores:', error);
    process.exit(1);
  }
}

// Get stock ID from command line or use default (2091 for GE Vernova)
const stockId = process.argv[2] || 2091;
calculateQualityScoresForStock(stockId);
