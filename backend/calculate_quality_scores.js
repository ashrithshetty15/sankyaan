import db from './src/db.js';

/**
 * Calculate Piotroski F-Score (0-9)
 * Based on 9 fundamental criteria
 */
function calculatePiotroskiScore(fundamentals) {
  if (!fundamentals) return null;

  let score = 0;

  // Profitability (4 points)
  if (fundamentals.net_income !== null && fundamentals.net_income !== undefined && fundamentals.net_income > 0) score++; // Positive net income
  if (fundamentals.operating_cash_flow !== null && fundamentals.operating_cash_flow !== undefined && fundamentals.operating_cash_flow > 0) score++; // Positive operating cash flow
  if (fundamentals.roa !== null && fundamentals.roa !== undefined && fundamentals.roa > 0) score++; // Positive ROA
  if (fundamentals.operating_cash_flow !== null && fundamentals.net_income !== null &&
      fundamentals.operating_cash_flow !== undefined && fundamentals.net_income !== undefined &&
      fundamentals.operating_cash_flow > fundamentals.net_income) score++; // Quality of earnings

  // Leverage, Liquidity and Source of Funds (3 points)
  if (fundamentals.debt_to_equity !== null && fundamentals.debt_to_equity !== undefined && fundamentals.debt_to_equity < 1) score++; // Decreasing leverage (simplified: D/E < 1)
  if (fundamentals.current_ratio !== null && fundamentals.current_ratio !== undefined && fundamentals.current_ratio > 1.5) score++; // Increasing liquidity
  if (fundamentals.gross_margin !== null && fundamentals.gross_margin !== undefined && fundamentals.gross_margin > 30) score++; // Positive gross margin > 30% (stored as percentage)

  // Operating Efficiency (2 points)
  if (fundamentals.operating_margin !== null && fundamentals.operating_margin !== undefined && fundamentals.operating_margin > 15) score++; // Improving operating margin > 15% (stored as percentage)
  if (fundamentals.net_margin !== null && fundamentals.net_margin !== undefined && fundamentals.net_margin > 10) score++; // Improving net margin > 10% (stored as percentage)

  return score;
}

/**
 * Calculate Altman Z-Score
 * Z = 1.2X1 + 1.4X2 + 3.3X3 + 0.6X4 + 1.0X5
 * Where:
 * X1 = Working Capital / Total Assets
 * X2 = Retained Earnings / Total Assets (approximated by equity/assets)
 * X3 = EBIT / Total Assets (approximated by operating income/assets)
 * X4 = Market Value of Equity / Total Liabilities (market cap / liabilities)
 * X5 = Sales / Total Assets (approximated by revenue/assets)
 */
function calculateAltmanZScore(fundamentals, marketCap) {
  if (!fundamentals || !fundamentals.total_assets || !fundamentals.total_liabilities) {
    return null;
  }

  const totalAssets = parseFloat(fundamentals.total_assets || 0);
  const totalLiabilities = parseFloat(fundamentals.total_liabilities || 0);
  const currentAssets = parseFloat(fundamentals.current_assets || 0);
  const currentLiabilities = parseFloat(fundamentals.current_liabilities || 0);
  const shareholdersEquity = parseFloat(fundamentals.shareholders_equity || 0);
  const operatingIncome = parseFloat(fundamentals.operating_income || 0);
  const revenue = parseFloat(fundamentals.revenue || 0);

  if (totalAssets === 0) return null;

  // X1: Working Capital / Total Assets
  const workingCapital = currentAssets - currentLiabilities;
  const x1 = workingCapital / totalAssets;

  // X2: Retained Earnings / Total Assets (approximated)
  const x2 = shareholdersEquity / totalAssets;

  // X3: EBIT / Total Assets
  const x3 = operatingIncome / totalAssets;

  // X4: Market Value of Equity / Total Liabilities
  // Cap at 10 to prevent unrealistic values (typical range: 0-10)
  const x4Raw = totalLiabilities > 0 ? (marketCap || 0) / totalLiabilities : 0;
  const x4 = Math.min(x4Raw, 10);

  // X5: Sales / Total Assets
  const x5 = revenue / totalAssets;

  const zScore = (1.2 * x1) + (1.4 * x2) + (3.3 * x3) + (0.6 * x4) + (1.0 * x5);

  return zScore;
}

/**
 * Calculate Magic Formula Score (0-100)
 * Based on Joel Greenblatt's Magic Formula
 * Combines Earnings Yield and Return on Capital
 */
function calculateMagicFormulaScore(fundamentals, marketCap) {
  if (!fundamentals || !marketCap) return null;

  let score = 0;
  let weights = 0;

  const ebit = parseFloat(fundamentals.operating_income || 0);
  const totalAssets = parseFloat(fundamentals.total_assets || 0);
  const currentLiabilities = parseFloat(fundamentals.current_liabilities || 0);

  // 1. Earnings Yield = EBIT / Market Cap (50%)
  // Higher is better. Normalize: 0-20% range
  if (marketCap > 0 && ebit > 0) {
    const earningsYield = (ebit / marketCap) * 100; // Convert to percentage
    const eyScore = Math.max(0, Math.min(earningsYield / 20, 1)) * 100; // Max at 20%
    score += eyScore * 0.5;
    weights += 0.5;
  }

  // 2. Return on Capital = EBIT / (Total Assets - Current Liabilities) (50%)
  // Higher is better. Normalize: 0-30% range
  const capital = totalAssets - currentLiabilities;
  if (capital > 0 && ebit > 0) {
    const returnOnCapital = (ebit / capital) * 100;
    const rocScore = Math.max(0, Math.min(returnOnCapital / 30, 1)) * 100; // Max at 30%
    score += rocScore * 0.5;
    weights += 0.5;
  }

  const result = weights > 0 ? Math.round(score / weights) : null;
  return (result !== null && !isNaN(result)) ? result : null;
}

/**
 * Calculate CANSLIM Score (0-100)
 * Based on William O'Neil's CANSLIM methodology
 */
function calculateCANSLIMScore(fundamentals, shareholding, marketCap) {
  if (!fundamentals) return null;

  let score = 0;
  let weights = 0;

  // C = Current Earnings (20%) - Positive and growing
  if (fundamentals.net_income !== null && fundamentals.net_income > 0 && fundamentals.net_margin !== null) {
    const earningsScore = Math.max(0, Math.min(parseFloat(fundamentals.net_margin) / 15, 1)) * 100;
    score += earningsScore * 0.2;
    weights += 0.2;
  } else if (fundamentals.net_income !== null) {
    weights += 0.2; // Count but give 0 for losses
  }

  // A = Annual Earnings (20%) - Use ROE as proxy for growth
  if (fundamentals.roe !== null && parseFloat(fundamentals.roe) > 0) {
    const annualScore = Math.max(0, Math.min(parseFloat(fundamentals.roe) / 25, 1)) * 100;
    score += annualScore * 0.2;
    weights += 0.2;
  } else if (fundamentals.roe !== null) {
    weights += 0.2;
  }

  // N = New (Innovation) (10%) - Use operating margin as proxy for competitive advantage
  if (fundamentals.operating_margin !== null && parseFloat(fundamentals.operating_margin) > 0) {
    const innovationScore = Math.max(0, Math.min(parseFloat(fundamentals.operating_margin) / 20, 1)) * 100;
    score += innovationScore * 0.1;
    weights += 0.1;
  } else if (fundamentals.operating_margin !== null) {
    weights += 0.1;
  }

  // S = Supply/Demand (10%) - Use market cap (larger = more liquid)
  if (marketCap && marketCap > 0) {
    // Score based on market cap: > 1T = 100, > 100B = 75, > 10B = 50, > 1B = 25
    const capInBillions = marketCap / 1000000000;
    let supplyScore = 0;
    if (capInBillions > 1000) supplyScore = 100;
    else if (capInBillions > 100) supplyScore = 75;
    else if (capInBillions > 10) supplyScore = 50;
    else if (capInBillions > 1) supplyScore = 25;
    score += supplyScore * 0.1;
    weights += 0.1;
  }

  // L = Leader (15%) - ROA compared to threshold (leader if ROA > 10%)
  if (fundamentals.roa !== null && parseFloat(fundamentals.roa) > 0) {
    const leaderScore = Math.max(0, Math.min(parseFloat(fundamentals.roa) / 15, 1)) * 100;
    score += leaderScore * 0.15;
    weights += 0.15;
  } else if (fundamentals.roa !== null) {
    weights += 0.15;
  }

  // I = Institutional Sponsorship (15%) - FII + DII holdings
  if (shareholding && shareholding.fii_holding !== null && shareholding.dii_holding !== null) {
    const institutional = parseFloat(shareholding.fii_holding || 0) + parseFloat(shareholding.dii_holding || 0);
    const instScore = Math.max(0, Math.min(institutional / 50, 1)) * 100; // Max at 50%
    score += instScore * 0.15;
    weights += 0.15;
  }

  // M = Market (10%) - Use current ratio as proxy for stability
  if (fundamentals.current_ratio !== null) {
    const marketScore = Math.max(0, Math.min(parseFloat(fundamentals.current_ratio) / 2, 1)) * 100;
    score += marketScore * 0.1;
    weights += 0.1;
  }

  const result = weights > 0 ? Math.round(score / weights) : null;
  return (result !== null && !isNaN(result)) ? result : null;
}

/**
 * Calculate Overall Quality Score (0-100)
 * Average of Piotroski, Magic Formula, and CANSLIM scores
 */
function calculateOverallQualityScore(piotroskiScore, magicFormulaScore, canslimScore) {
  const scores = [];

  // Normalize Piotroski to 0-100 scale
  if (piotroskiScore !== null && piotroskiScore !== undefined && !isNaN(piotroskiScore)) {
    scores.push((piotroskiScore / 9) * 100);
  }

  if (magicFormulaScore !== null && magicFormulaScore !== undefined && !isNaN(magicFormulaScore)) {
    scores.push(magicFormulaScore);
  }

  if (canslimScore !== null && canslimScore !== undefined && !isNaN(canslimScore)) {
    scores.push(canslimScore);
  }

  // Return average of available scores
  if (scores.length === 0) return null;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const result = Math.round(average);

  // Final NaN check
  return !isNaN(result) ? result : null;
}

/**
 * Calculate Financial Health Score (0-100)
 */
function calculateFinancialHealthScore(fundamentals, altmanZScore) {
  if (!fundamentals) return null;

  let score = 0;
  let weights = 0;

  // Debt to Equity (25%)
  if (fundamentals.debt_to_equity !== null) {
    const deScore = Math.max(0, 100 - (fundamentals.debt_to_equity * 20)); // Lower is better
    score += deScore * 0.25;
    weights += 0.25;
  }

  // Current Ratio (25%)
  if (fundamentals.current_ratio !== null) {
    const crScore = Math.max(0, Math.min(fundamentals.current_ratio / 2, 1)) * 100;
    score += crScore * 0.25;
    weights += 0.25;
  }

  // Altman Z-Score (30%)
  if (altmanZScore !== null) {
    const zScore = Math.max(0, Math.min(altmanZScore / 3, 1)) * 100;
    score += zScore * 0.30;
    weights += 0.30;
  }

  // Operating Cash Flow (20%)
  if (fundamentals.operating_cash_flow !== null && fundamentals.operating_cash_flow > 0) {
    score += 100 * 0.20;
    weights += 0.20;
  } else if (fundamentals.operating_cash_flow !== null) {
    // Negative operating cash flow: include as 0 in weighted average
    weights += 0.20;
  }

  return weights > 0 ? Math.round(Math.max(0, score / weights)) : null;
}

/**
 * Calculate Management Quality Score (0-100)
 */
function calculateManagementQualityScore(fundamentals) {
  if (!fundamentals) return null;

  let score = 0;
  let weights = 0;

  // ROE (40%) - clamped 0-100, negative ROE gives 0
  if (fundamentals.roe !== null) {
    const roeScore = Math.max(0, Math.min(fundamentals.roe / 20, 1)) * 100;
    score += roeScore * 0.40;
    weights += 0.40;
  }

  // ROA (30%) - clamped 0-100, negative ROA gives 0
  if (fundamentals.roa !== null) {
    const roaScore = Math.max(0, Math.min(fundamentals.roa / 10, 1)) * 100;
    score += roaScore * 0.30;
    weights += 0.30;
  }

  // Operating Margin (30%) - clamped 0-100
  if (fundamentals.operating_margin !== null) {
    const omScore = Math.max(0, Math.min(fundamentals.operating_margin / 20, 1)) * 100;
    score += omScore * 0.30;
    weights += 0.30;
  }

  return weights > 0 ? Math.round(Math.max(0, score / weights)) : null;
}

/**
 * Calculate Earnings Quality Score (0-100)
 */
function calculateEarningsQualityScore(fundamentals) {
  if (!fundamentals) return null;

  let score = 0;
  let weights = 0;

  // Operating Cash Flow vs Net Income (40%)
  if (fundamentals.operating_cash_flow !== null && fundamentals.net_income !== null && fundamentals.net_income > 0) {
    const ratio = fundamentals.operating_cash_flow / fundamentals.net_income;
    const ocfScore = Math.min(ratio, 1.5) / 1.5 * 100; // Max at 1.5x
    score += ocfScore * 0.40;
    weights += 0.40;
  }

  // Net Margin (30%) - clamped 0-100, negative margin gives 0
  if (fundamentals.net_margin !== null) {
    const nmScore = Math.max(0, Math.min(fundamentals.net_margin / 15, 1)) * 100;
    score += nmScore * 0.30;
    weights += 0.30;
  }

  // Gross Margin (30%) - clamped 0-100
  if (fundamentals.gross_margin !== null) {
    const gmScore = Math.max(0, Math.min(fundamentals.gross_margin / 40, 1)) * 100;
    score += gmScore * 0.30;
    weights += 0.30;
  }

  return weights > 0 ? Math.round(Math.max(0, score / weights)) : null;
}

/**
 * Calculate and store quality scores for a stock
 */
async function calculateQualityScoresForStock(stockId, fundamentals, shareholding, marketCap) {
  try {
    // Calculate all scores
    const piotroskiScore = calculatePiotroskiScore(fundamentals);
    const magicFormulaScore = calculateMagicFormulaScore(fundamentals, marketCap);
    const canslimScore = calculateCANSLIMScore(fundamentals, shareholding, marketCap);
    const altmanZScore = calculateAltmanZScore(fundamentals, marketCap);

    // Overall score is average of the three main methodologies
    const overallQualityScore = calculateOverallQualityScore(piotroskiScore, magicFormulaScore, canslimScore);

    // Keep legacy scores for backwards compatibility
    const financialHealthScore = calculateFinancialHealthScore(fundamentals, altmanZScore);
    const managementQualityScore = calculateManagementQualityScore(fundamentals);
    const earningsQualityScore = calculateEarningsQualityScore(fundamentals);

    // Store in database
    await db.query(`
      INSERT INTO stock_quality_scores (
        stock_id,
        calculated_date,
        piotroski_score,
        magic_formula_score,
        canslim_score,
        altman_z_score,
        overall_quality_score,
        financial_health_score,
        management_quality_score,
        earnings_quality_score
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (stock_id, calculated_date) DO UPDATE
      SET piotroski_score = $2,
          magic_formula_score = $3,
          canslim_score = $4,
          altman_z_score = $5,
          overall_quality_score = $6,
          financial_health_score = $7,
          management_quality_score = $8,
          earnings_quality_score = $9
    `, [
      stockId,
      piotroskiScore,
      magicFormulaScore,
      canslimScore,
      altmanZScore,
      overallQualityScore,
      financialHealthScore,
      managementQualityScore,
      earningsQualityScore
    ]);

    return {
      piotroskiScore,
      magicFormulaScore,
      canslimScore,
      altmanZScore,
      overallQualityScore,
      financialHealthScore,
      managementQualityScore,
      earningsQualityScore
    };
  } catch (error) {
    console.error(`Error calculating quality scores for stock ${stockId}:`, error);
    throw error;
  }
}

/**
 * Main function to calculate quality scores for all stocks
 */
async function calculateAllQualityScores() {
  try {
    console.log('🔍 Calculating quality scores for all stocks...\n');

    // Get all stocks with fundamentals and shareholding pattern
    // Use LATERAL joins to get the latest fundamentals and shareholding separately
    const result = await db.query(`
      SELECT
        s.id as stock_id,
        s.symbol,
        s.market_cap,
        sf.period_type, sf.fiscal_year, sf.fiscal_quarter,
        sf.revenue, sf.operating_income, sf.net_income, sf.ebitda, sf.eps,
        sf.total_assets, sf.total_liabilities,
        COALESCE(sf.shareholders_equity, sf.total_assets - sf.total_liabilities) as shareholders_equity,
        sf.current_assets, sf.current_liabilities,
        sf.operating_cash_flow, sf.investing_cash_flow, sf.financing_cash_flow, sf.free_cash_flow,
        sf.pe_ratio, sf.pb_ratio,
        COALESCE(sf.roe,
          CASE WHEN (sf.total_assets - sf.total_liabilities) > 0 AND sf.net_income IS NOT NULL
               THEN (sf.net_income / NULLIF(sf.total_assets - sf.total_liabilities, 0)) * 100
               ELSE NULL END
        ) as roe,
        COALESCE(sf.roa,
          CASE WHEN sf.total_assets > 0 AND sf.net_income IS NOT NULL
               THEN (sf.net_income / NULLIF(sf.total_assets, 0)) * 100
               ELSE NULL END
        ) as roa,
        sf.debt_to_equity, sf.current_ratio, sf.quick_ratio,
        sf.gross_margin, sf.operating_margin, sf.net_margin,
        sp.promoter_holding, sp.fii_holding, sp.dii_holding, sp.public_holding, sp.promoter_pledged
      FROM stocks s
      INNER JOIN LATERAL (
        SELECT *
        FROM stock_fundamentals
        WHERE stock_id = s.id
        ORDER BY fiscal_year DESC, id DESC
        LIMIT 1
      ) sf ON true
      LEFT JOIN LATERAL (
        SELECT *
        FROM shareholding_pattern
        WHERE stock_id = s.id
        ORDER BY date DESC
        LIMIT 1
      ) sp ON true
      ORDER BY s.symbol
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  No stocks with fundamental data found.');
      console.log('   Please fetch fundamental data first.');
      return;
    }

    console.log(`Found ${result.rows.length} stocks with fundamental data.\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const row of result.rows) {
      try {
        console.log(`📊 Processing ${row.symbol}...`);

        // Prepare shareholding object
        const shareholding = {
          promoter_holding: row.promoter_holding,
          fii_holding: row.fii_holding,
          dii_holding: row.dii_holding,
          public_holding: row.public_holding,
          promoter_pledged: row.promoter_pledged
        };

        const scores = await calculateQualityScoresForStock(
          row.stock_id,
          row,
          shareholding,
          parseFloat(row.market_cap || 0)
        );

        console.log(`   ✓ Piotroski F-Score: ${scores.piotroskiScore}/9 (${Math.round((scores.piotroskiScore/9)*100)}%)`);
        console.log(`   ✓ Magic Formula: ${scores.magicFormulaScore}/100`);
        console.log(`   ✓ CANSLIM: ${scores.canslimScore}/100`);
        console.log(`   ✓ Overall Quality: ${scores.overallQualityScore}/100 (Average of 3 methods)`);
        console.log(`   ✓ Altman Z-Score: ${scores.altmanZScore?.toFixed(2) || 'N/A'}\n`);

        successCount++;
      } catch (error) {
        console.error(`   ✗ Error: ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('✨ Quality score calculation complete!');
    console.log(`   Success: ${successCount} stocks`);
    console.log(`   Errors: ${errorCount} stocks`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the calculation
calculateAllQualityScores();
