import db from './src/db.js';

/**
 * Calculate Quality Scores from FMP data
 * Works with the stock_fundamentals VIEW created by fetch_stock_fundamentals.py
 */

// Helper to safely parse float
function parseNum(val) {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

/**
 * Piotroski F-Score (0-9)
 * Based on 9 fundamental criteria for financial strength
 */
function calculatePiotroskiScore(fund) {
  let score = 0;

  // Profitability (4 points)
  if (parseNum(fund.net_income) > 0) score++; // Positive net income
  if (parseNum(fund.operating_cash_flow) > 0) score++; // Positive operating cash flow
  if (parseNum(fund.roe_pct) > 0 || parseNum(fund.roe_fmp) > 0) score++; // Positive ROE
  if (parseNum(fund.operating_cash_flow) > parseNum(fund.net_income)) score++; // Quality of earnings

  // Leverage, Liquidity, Source of Funds (3 points)
  if (parseNum(fund.debt_to_equity) !== null) {
    // We only have current period, so assume improvement if debt/equity < 1
    if (parseNum(fund.debt_to_equity) < 1) score++;
  }
  if (parseNum(fund.current_ratio) > 1) score++; // Current ratio > 1

  // Operating Efficiency (2 points)
  // Assume improvement if margins are good (no historical data)
  if (parseNum(fund.operating_margin) > 15) score++; // Strong operating margin
  if (parseNum(fund.net_margin) > 10) score++; // Strong net margin

  return score;
}

/**
 * Magic Formula Score (0-100)
 * Based on Joel Greenblatt's formula: High Earnings Yield + High ROCE
 */
function calculateMagicFormulaScore(fund) {
  const earningsYield = parseNum(fund.pe_ratio) > 0 ? (100 / parseNum(fund.pe_ratio)) : null;
  const roce = parseNum(fund.roce_pct) || parseNum(fund.roce_fmp);

  if (!earningsYield && !roce) return null;

  let score = 0;
  let weights = 0;

  // Earnings Yield (50%)
  if (earningsYield !== null) {
    const eyScore = Math.max(0, Math.min(earningsYield / 20, 1)) * 100; // Cap at 20% earnings yield
    score += eyScore * 0.5;
    weights += 0.5;
  }

  // Return on Capital (50%)
  if (roce !== null) {
    const roceScore = Math.max(0, Math.min(roce / 30, 1)) * 100; // Cap at 30% ROCE
    score += roceScore * 0.5;
    weights += 0.5;
  }

  // Don't normalize - if only one component is available, max score is 50, not 100
  // This ensures we don't inflate scores when data is incomplete
  return weights > 0 ? Math.round(score) : null;
}

/**
 * CANSLIM Score (0-100)
 */
function calculateCANSLIMScore(fund) {
  let score = 0;
  let weights = 0;

  // C = Current Earnings (20%)
  const netMargin = parseNum(fund.net_margin);
  if (netMargin !== null && netMargin > 0) {
    const earningsScore = Math.max(0, Math.min(netMargin / 15, 1)) * 100;
    score += earningsScore * 0.2;
    weights += 0.2;
  }

  // A = Annual Earnings Growth (20%) - Use ROE as proxy
  const roe = parseNum(fund.roe_pct) || parseNum(fund.roe_fmp);
  if (roe !== null && roe > 0) {
    const annualScore = Math.max(0, Math.min(roe / 25, 1)) * 100;
    score += annualScore * 0.2;
    weights += 0.2;
  }

  // N = New (20%) - Use operating margin as proxy for innovation
  const opMargin = parseNum(fund.operating_margin);
  if (opMargin !== null) {
    const newScore = Math.max(0, Math.min(opMargin / 20, 1)) * 100;
    score += newScore * 0.2;
    weights += 0.2;
  }

  // S = Supply & Demand (15%) - Use market cap as proxy (larger = more liquid)
  const marketCap = parseNum(fund.market_cap_cr);
  if (marketCap !== null) {
    const supplyScore = marketCap > 10000 ? 100 : marketCap > 1000 ? 70 : 40;
    score += supplyScore * 0.15;
    weights += 0.15;
  }

  // L = Leader (15%) - Use ROCE as proxy for market leadership
  const roce = parseNum(fund.roce_pct) || parseNum(fund.roce_fmp);
  if (roce !== null) {
    const leaderScore = Math.max(0, Math.min(roce / 25, 1)) * 100;
    score += leaderScore * 0.15;
    weights += 0.15;
  }

  // M = Market Direction (10%) - Use current ratio as proxy for stability
  const currentRatio = parseNum(fund.current_ratio);
  if (currentRatio !== null) {
    const marketScore = currentRatio > 2 ? 100 : currentRatio > 1.5 ? 80 : currentRatio > 1 ? 60 : 30;
    score += marketScore * 0.1;
    weights += 0.1;
  }

  return weights > 0 ? Math.round(score / weights) : null;
}

/**
 * Altman Z-Score (bankruptcy prediction)
 * Z > 2.99: Safe, 1.81-2.99: Gray, < 1.81: Distress
 */
function calculateAltmanZScore(fund) {
  const totalAssets = parseNum(fund.total_assets);
  const equity = parseNum(fund.total_stockholders_equity);
  const revenue = parseNum(fund.revenue);
  const ebitda = parseNum(fund.ebitda);
  const totalDebt = parseNum(fund.total_debt);
  const marketCap = parseNum(fund.market_cap_cr) ? parseNum(fund.market_cap_cr) * 10000000 : null;

  if (!totalAssets || totalAssets === 0) return null;

  // Working Capital / Total Assets
  const currentAssets = totalAssets * 0.4; // Estimate (no separate current assets in view)
  const currentLiabilities = parseNum(fund.current_ratio) > 0 && currentAssets
    ? currentAssets / parseNum(fund.current_ratio)
    : totalAssets * 0.2;
  const workingCapital = currentAssets - currentLiabilities;
  const x1 = workingCapital / totalAssets;

  // Retained Earnings / Total Assets (use equity as proxy)
  const x2 = equity ? equity / totalAssets : 0;

  // EBIT / Total Assets
  const x3 = ebitda ? ebitda / totalAssets : 0;

  // Market Cap / Total Liabilities
  // Cap at 10 to prevent unrealistic values when liabilities are very low
  const totalLiabilities = totalAssets - (equity || 0);
  const x4Raw = marketCap && totalLiabilities > 0 ? marketCap / totalLiabilities : 0;
  const x4 = Math.min(x4Raw, 10); // Cap at 10 (typical range: 0-10)

  // Sales / Total Assets
  const x5 = revenue ? revenue / totalAssets : 0;

  const zScore = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;

  return isNaN(zScore) || !isFinite(zScore) ? null : Math.round(zScore * 100) / 100;
}

/**
 * Financial Health Score (0-100)
 */
function calculateFinancialHealthScore(fund) {
  let score = 0;
  let weights = 0;

  // Debt to Equity
  const debtToEquity = parseNum(fund.debt_to_equity);
  if (debtToEquity !== null) {
    const debtScore = debtToEquity < 0.5 ? 100 : debtToEquity < 1 ? 80 : debtToEquity < 2 ? 60 : 30;
    score += debtScore * 0.3;
    weights += 0.3;
  }

  // Current Ratio
  const currentRatio = parseNum(fund.current_ratio);
  if (currentRatio !== null) {
    const liquidityScore = currentRatio > 2 ? 100 : currentRatio > 1.5 ? 80 : currentRatio > 1 ? 60 : 30;
    score += liquidityScore * 0.3;
    weights += 0.3;
  }

  // Interest Coverage (use EBITDA margin as proxy)
  const ebitdaMargin = parseNum(fund.ebitda_margin);
  if (ebitdaMargin !== null) {
    const coverageScore = Math.max(0, Math.min(ebitdaMargin / 30, 1)) * 100;
    score += coverageScore * 0.2;
    weights += 0.2;
  }

  // Free Cash Flow
  const fcf = parseNum(fund.free_cash_flow);
  if (fcf !== null) {
    const fcfScore = fcf > 0 ? 100 : 0;
    score += fcfScore * 0.2;
    weights += 0.2;
  }

  return weights > 0 ? Math.round(score / weights) : null;
}

/**
 * Management Quality Score (0-100)
 */
function calculateManagementQualityScore(fund) {
  let score = 0;
  let weights = 0;

  // ROE
  const roe = parseNum(fund.roe_pct) || parseNum(fund.roe_fmp);
  if (roe !== null) {
    const roeScore = Math.max(0, Math.min(roe / 20, 1)) * 100;
    score += roeScore * 0.4;
    weights += 0.4;
  }

  // ROCE
  const roce = parseNum(fund.roce_pct) || parseNum(fund.roce_fmp);
  if (roce !== null) {
    const roceScore = Math.max(0, Math.min(roce / 20, 1)) * 100;
    score += roceScore * 0.4;
    weights += 0.4;
  }

  // Operating Margin
  const opMargin = parseNum(fund.operating_margin);
  if (opMargin !== null) {
    const marginScore = Math.max(0, Math.min(opMargin / 25, 1)) * 100;
    score += marginScore * 0.2;
    weights += 0.2;
  }

  return weights > 0 ? Math.round(score / weights) : null;
}

/**
 * Earnings Quality Score (0-100)
 */
function calculateEarningsQualityScore(fund) {
  let score = 0;
  let weights = 0;

  // Operating Cash Flow vs Net Income
  const ocf = parseNum(fund.operating_cash_flow);
  const netIncome = parseNum(fund.net_income);
  if (ocf !== null && netIncome !== null && netIncome > 0) {
    const ratio = ocf / netIncome;
    const cashScore = ratio > 1.2 ? 100 : ratio > 1 ? 80 : ratio > 0.8 ? 60 : 30;
    score += cashScore * 0.4;
    weights += 0.4;
  }

  // Net Margin
  const netMargin = parseNum(fund.net_margin);
  if (netMargin !== null) {
    const marginScore = Math.max(0, Math.min(netMargin / 20, 1)) * 100;
    score += marginScore * 0.3;
    weights += 0.3;
  }

  // FCF Yield
  const fcfYield = parseNum(fund.fcf_yield_pct);
  if (fcfYield !== null) {
    const fcfScore = Math.max(0, Math.min(fcfYield / 10, 1)) * 100;
    score += fcfScore * 0.3;
    weights += 0.3;
  }

  return weights > 0 ? Math.round(score / weights) : null;
}

/**
 * Overall Quality Score (0-100)
 * Weighted formula: Each component contributes 0-25 points
 * - Piotroski F-Score: 0-25 points (from 0-9 scale)
 * - Magic Formula: 0-25 points (from 0-100 scale)
 * - CANSLIM: 0-25 points (from 0-100 scale)
 * - Altman Z-Score: 0-25 points (normalized from continuous scale)
 */
function calculateOverallQualityScore(scores) {
  let totalScore = 0;
  let componentsCount = 0;

  // 1. Piotroski F-Score: 0-9 → 0-25 points
  if (scores.piotroski_score !== null && scores.piotroski_score !== undefined) {
    const piotroskiPoints = (scores.piotroski_score / 9) * 25;
    totalScore += piotroskiPoints;
    componentsCount++;
  }

  // 2. Magic Formula: 0-100 → 0-25 points
  if (scores.magic_formula_score !== null && scores.magic_formula_score !== undefined) {
    const magicPoints = (scores.magic_formula_score / 100) * 25;
    totalScore += magicPoints;
    componentsCount++;
  }

  // 3. CANSLIM: 0-100 → 0-25 points
  if (scores.canslim_score !== null && scores.canslim_score !== undefined) {
    const canslimPoints = (scores.canslim_score / 100) * 25;
    totalScore += canslimPoints;
    componentsCount++;
  }

  // 4. Altman Z-Score: continuous → 0-25 points
  // Traditional Altman Z thresholds:
  // - Distress (Z < 1.81): 0-7 points
  // - Grey (1.81 ≤ Z ≤ 2.99): 8-24 points
  // - Safe (Z > 2.99): 25 points
  if (scores.altman_z_score !== null && scores.altman_z_score !== undefined) {
    const z = scores.altman_z_score;
    let altmanPoints = 0;

    if (z < 0) {
      altmanPoints = 0; // Negative = severe bankruptcy risk
    } else if (z < 1.81) {
      // Distress zone: 0-7 points
      altmanPoints = (z / 1.81) * 7;
    } else if (z <= 2.99) {
      // Grey zone: 8-24 points
      altmanPoints = 8 + ((z - 1.81) / (2.99 - 1.81)) * 16;
    } else {
      // Safe zone: 25 points (Z > 2.99)
      altmanPoints = 25;
    }

    totalScore += altmanPoints;
    componentsCount++;
  }

  // Return null if no components available, otherwise calculate average
  if (componentsCount === 0) return null;

  // Total score is the sum of all components (max 100 if all 4 present)
  return Math.round(totalScore);
}

/**
 * Main calculation function
 */
async function calculateQualityScoresFMP() {
  try {
    console.log('🔄 Calculating quality scores from FMP data...\n');

    // Check if stock_quality_scores table exists, if not create it
    await db.query(`
      CREATE TABLE IF NOT EXISTS stock_quality_scores (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
        calculated_date DATE DEFAULT CURRENT_DATE,
        piotroski_score INTEGER,
        altman_z_score NUMERIC(10,2),
        earnings_quality_score INTEGER,
        balance_sheet_quality_score INTEGER,
        cash_flow_quality_score INTEGER,
        overall_quality_score INTEGER,
        red_flags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        financial_health_score INTEGER,
        management_quality_score INTEGER,
        magic_formula_score NUMERIC(5,2),
        canslim_score NUMERIC(5,2),
        UNIQUE(stock_id, calculated_date)
      )
    `);

    // Get all stocks with FMP data
    const result = await db.query(`
      SELECT
        sf.*,
        s.id as stock_id
      FROM stock_fundamentals sf
      LEFT JOIN stocks s ON s.symbol = sf.fmp_symbol
      WHERE sf.revenue IS NOT NULL
      ORDER BY sf.nse_symbol
    `);

    const stocks = result.rows;
    console.log(`Found ${stocks.length} stocks with fundamental data\n`);

    if (stocks.length === 0) {
      console.log('❌ No fundamental data found!');
      console.log('   Please run: python fetch_stock_fundamentals.py\n');
      process.exit(1);
    }

    let processed = 0;
    let withStockId = 0;
    let withoutStockId = 0;

    for (const fund of stocks) {
      try {
        // Calculate all scores
        const scores = {
          piotroski_score: calculatePiotroskiScore(fund),
          magic_formula_score: calculateMagicFormulaScore(fund),
          canslim_score: calculateCANSLIMScore(fund),
          altman_z_score: calculateAltmanZScore(fund),
          financial_health_score: calculateFinancialHealthScore(fund),
          management_quality_score: calculateManagementQualityScore(fund),
          earnings_quality_score: calculateEarningsQualityScore(fund)
        };

        scores.overall_quality_score = calculateOverallQualityScore(scores);

        // Only save if we have a stock_id (matched with stocks table)
        if (fund.stock_id) {
          await db.query(`
            INSERT INTO stock_quality_scores (
              stock_id, calculated_date,
              piotroski_score, magic_formula_score, canslim_score,
              altman_z_score, financial_health_score,
              management_quality_score, earnings_quality_score,
              overall_quality_score
            ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (stock_id, calculated_date) DO UPDATE SET
              piotroski_score = EXCLUDED.piotroski_score,
              magic_formula_score = EXCLUDED.magic_formula_score,
              canslim_score = EXCLUDED.canslim_score,
              altman_z_score = EXCLUDED.altman_z_score,
              financial_health_score = EXCLUDED.financial_health_score,
              management_quality_score = EXCLUDED.management_quality_score,
              earnings_quality_score = EXCLUDED.earnings_quality_score,
              overall_quality_score = EXCLUDED.overall_quality_score,
              updated_at = CURRENT_TIMESTAMP
          `, [
            fund.stock_id,
            scores.piotroski_score,
            scores.magic_formula_score,
            scores.canslim_score,
            scores.altman_z_score,
            scores.financial_health_score,
            scores.management_quality_score,
            scores.earnings_quality_score,
            scores.overall_quality_score
          ]);

          withStockId++;
        } else {
          withoutStockId++;
        }

        processed++;

        if (processed % 50 === 0) {
          console.log(`Processed ${processed}/${stocks.length} stocks...`);
        }

      } catch (error) {
        console.error(`Error processing ${fund.nse_symbol}:`, error.message);
      }
    }

    console.log(`\n✅ Quality scores calculated!`);
    console.log(`   Total processed: ${processed}`);
    console.log(`   Saved to database: ${withStockId}`);
    console.log(`   Skipped (no match in stocks table): ${withoutStockId}\n`);

    if (withoutStockId > 0) {
      console.log(`⚠️  ${withoutStockId} stocks from FMP don't match stocks table`);
      console.log(`   This is normal - FMP has ${stocks.length} stocks, stocks table has different symbols\n`);
    }

    console.log('Next step: node compute_stock_ratings_cache.js');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

calculateQualityScoresFMP();
