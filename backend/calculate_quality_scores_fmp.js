import db from './src/db.js';

/**
 * Calculate Quality Scores from FMP data — 5-Pillar System
 *
 * Overall Quality Score (0-100) = weighted average of:
 *   Profitability      (25%) - ROE, ROCE, Operating Margin, Net Margin
 *   Financial Strength (20%) - Piotroski, Altman-Z, D/E, Interest Coverage, Pledging
 *   Earnings Quality   (20%) - OCF/NI ratio, FCF Yield, Accruals
 *   Growth             (15%) - Revenue Growth YoY, EPS Growth YoY, Margin Expansion
 *   Valuation          (20%) - PE, PB, Earnings Yield
 *
 * Standalone scores (Piotroski, Altman-Z, Magic Formula, CANSLIM) are still
 * computed and stored for backward compatibility.
 *
 * Usage: node calculate_quality_scores_fmp.js
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

function parseNum(val) {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

// ─── Standalone Scores (kept for backward compatibility) ─────────────────────

/**
 * Piotroski F-Score (0-9)
 */
function calculatePiotroskiScore(d) {
  let score = 0;
  if (parseNum(d.net_income) > 0) score++;
  if (parseNum(d.operating_cash_flow) > 0) score++;
  const roe = parseNum(d.roe_pct) || (parseNum(d.roe) !== null ? parseNum(d.roe) * 100 : null);
  if (roe > 0) score++;
  if (parseNum(d.operating_cash_flow) > parseNum(d.net_income)) score++;
  if (parseNum(d.debt_to_equity) !== null && parseNum(d.debt_to_equity) < 1) score++;
  if (parseNum(d.current_ratio) > 1) score++;
  if (parseNum(d.operating_margin) > 15) score++;
  if (parseNum(d.net_margin) > 10) score++;
  // 9th point: gross margin > 30% (use gross_profit_ratio if available)
  const grossMargin = parseNum(d.gross_profit_ratio);
  if (grossMargin !== null && grossMargin * 100 > 30) score++;
  else if (grossMargin === null && parseNum(d.operating_margin) > 20) score++; // fallback
  return score;
}

/**
 * Magic Formula Score (0-100)
 */
function calculateMagicFormulaScore(d) {
  const pe = parseNum(d.pe_ratio);
  const earningsYield = pe > 0 ? (100 / pe) : null;
  const roce = parseNum(d.roce_pct) || (parseNum(d.roce) !== null ? parseNum(d.roce) * 100 : null);

  if (!earningsYield && !roce) return null;

  let score = 0;
  let weights = 0;
  if (earningsYield !== null) {
    score += Math.max(0, Math.min(earningsYield / 20, 1)) * 100 * 0.5;
    weights += 0.5;
  }
  if (roce !== null) {
    score += Math.max(0, Math.min(roce / 30, 1)) * 100 * 0.5;
    weights += 0.5;
  }
  return weights > 0 ? Math.round(score) : null;
}

/**
 * CANSLIM Score (0-100)
 */
function calculateCANSLIMScore(d) {
  let score = 0;
  let weights = 0;

  const netMargin = parseNum(d.net_margin);
  if (netMargin !== null && netMargin > 0) {
    score += Math.max(0, Math.min(netMargin / 15, 1)) * 100 * 0.2;
    weights += 0.2;
  }
  const roe = parseNum(d.roe_pct) || (parseNum(d.roe) !== null ? parseNum(d.roe) * 100 : null);
  if (roe !== null && roe > 0) {
    score += Math.max(0, Math.min(roe / 25, 1)) * 100 * 0.2;
    weights += 0.2;
  }
  const opMargin = parseNum(d.operating_margin);
  if (opMargin !== null) {
    score += Math.max(0, Math.min(opMargin / 20, 1)) * 100 * 0.2;
    weights += 0.2;
  }
  const marketCap = parseNum(d.market_cap);
  if (marketCap !== null) {
    const mcCr = marketCap / 1e7; // convert to crores
    const supplyScore = mcCr > 10000 ? 100 : mcCr > 1000 ? 70 : 40;
    score += supplyScore * 0.15;
    weights += 0.15;
  }
  const roce = parseNum(d.roce_pct) || (parseNum(d.roce) !== null ? parseNum(d.roce) * 100 : null);
  if (roce !== null) {
    score += Math.max(0, Math.min(roce / 25, 1)) * 100 * 0.15;
    weights += 0.15;
  }
  const currentRatio = parseNum(d.current_ratio);
  if (currentRatio !== null) {
    const mScore = currentRatio > 2 ? 100 : currentRatio > 1.5 ? 80 : currentRatio > 1 ? 60 : 30;
    score += mScore * 0.1;
    weights += 0.1;
  }
  return weights > 0 ? Math.round(score / weights) : null;
}

/**
 * Altman Z-Score
 */
function calculateAltmanZScore(d) {
  const totalAssets = parseNum(d.total_assets);
  const equity = parseNum(d.total_stockholders_equity);
  const revenue = parseNum(d.revenue);
  const ebit = parseNum(d.operating_income);
  const marketCap = parseNum(d.market_cap);
  const currentAssets = parseNum(d.total_current_assets);
  const currentLiabilities = parseNum(d.total_current_liabilities);
  const totalLiabilities = parseNum(d.total_liabilities);

  if (!totalAssets || totalAssets === 0) return null;

  const wc = (currentAssets && currentLiabilities)
    ? currentAssets - currentLiabilities
    : totalAssets * 0.2; // fallback estimate
  const x1 = wc / totalAssets;
  const x2 = equity ? equity / totalAssets : 0;
  const x3 = ebit ? ebit / totalAssets : 0;
  const tl = totalLiabilities || (totalAssets - (equity || 0));
  const x4Raw = marketCap && tl > 0 ? marketCap / tl : 0;
  const x4 = Math.min(x4Raw, 10);
  const x5 = revenue ? revenue / totalAssets : 0;

  const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
  return isNaN(z) || !isFinite(z) ? null : Math.round(z * 100) / 100;
}

// ─── Legacy sub-scores (still computed for backward compat) ──────────────────

function calculateFinancialHealthScore(d) {
  let score = 0, weights = 0;
  const de = parseNum(d.debt_to_equity);
  if (de !== null) { score += (de < 0.5 ? 100 : de < 1 ? 80 : de < 2 ? 60 : 30) * 0.3; weights += 0.3; }
  const cr = parseNum(d.current_ratio);
  if (cr !== null) { score += (cr > 2 ? 100 : cr > 1.5 ? 80 : cr > 1 ? 60 : 30) * 0.3; weights += 0.3; }
  const fcf = parseNum(d.free_cash_flow);
  if (fcf !== null) { score += (fcf > 0 ? 100 : 0) * 0.2; weights += 0.2; }
  const ocf = parseNum(d.operating_cash_flow);
  if (ocf !== null) { score += (ocf > 0 ? 100 : 0) * 0.2; weights += 0.2; }
  return weights > 0 ? Math.round(score / weights) : null;
}

function calculateManagementQualityScore(d) {
  let score = 0, weights = 0;
  const roe = parseNum(d.roe_pct) || (parseNum(d.roe) !== null ? parseNum(d.roe) * 100 : null);
  if (roe !== null) { score += Math.max(0, Math.min(roe / 20, 1)) * 100 * 0.4; weights += 0.4; }
  const roce = parseNum(d.roce_pct) || (parseNum(d.roce) !== null ? parseNum(d.roce) * 100 : null);
  if (roce !== null) { score += Math.max(0, Math.min(roce / 20, 1)) * 100 * 0.4; weights += 0.4; }
  const om = parseNum(d.operating_margin);
  if (om !== null) { score += Math.max(0, Math.min(om / 25, 1)) * 100 * 0.2; weights += 0.2; }
  return weights > 0 ? Math.round(score / weights) : null;
}

function calculateEarningsQualityScore(d) {
  let score = 0, weights = 0;
  const ocf = parseNum(d.operating_cash_flow);
  const ni = parseNum(d.net_income);
  if (ocf !== null && ni !== null && ni > 0) {
    const ratio = ocf / ni;
    score += (ratio > 1.2 ? 100 : ratio > 1 ? 80 : ratio > 0.8 ? 60 : 30) * 0.4;
    weights += 0.4;
  }
  const nm = parseNum(d.net_margin);
  if (nm !== null) { score += Math.max(0, Math.min(nm / 20, 1)) * 100 * 0.3; weights += 0.3; }
  const fcf = parseNum(d.free_cash_flow);
  const mc = parseNum(d.market_cap);
  if (fcf !== null && mc && mc > 0 && fcf > 0) {
    const fcfYield = (fcf / mc) * 100;
    score += Math.max(0, Math.min(fcfYield / 10, 1)) * 100 * 0.3;
    weights += 0.3;
  }
  return weights > 0 ? Math.round(score / weights) : null;
}

// ─── NEW: 5-Pillar Scoring System ────────────────────────────────────────────

/**
 * Pillar 1: Profitability Score (0-100)
 * ROE(30%) + ROCE(30%) + Operating Margin(20%) + Net Margin(20%)
 */
function calculateProfitabilityScore(d) {
  let score = 0, weights = 0;

  const roe = parseNum(d.roe_pct) || (parseNum(d.roe) !== null ? parseNum(d.roe) * 100 : null);
  if (roe !== null) {
    score += Math.max(0, Math.min(roe / 25, 1)) * 100 * 0.30;
    weights += 0.30;
  }
  const roce = parseNum(d.roce_pct) || (parseNum(d.roce) !== null ? parseNum(d.roce) * 100 : null);
  if (roce !== null) {
    score += Math.max(0, Math.min(roce / 20, 1)) * 100 * 0.30;
    weights += 0.30;
  }
  const om = parseNum(d.operating_margin);
  if (om !== null) {
    score += Math.max(0, Math.min(om / 25, 1)) * 100 * 0.20;
    weights += 0.20;
  }
  const nm = parseNum(d.net_margin);
  if (nm !== null) {
    score += Math.max(0, Math.min(nm / 15, 1)) * 100 * 0.20;
    weights += 0.20;
  }
  return weights > 0 ? Math.round(score / weights * 100) / 100 : null;
}

/**
 * Pillar 2: Financial Strength Score (0-100)
 * Piotroski(30%) + Altman-Z(25%) + D/E(20%) + Interest Coverage(15%) + Pledging(10%)
 */
function calculateFinancialStrengthScore(d, piotroskiScore, altmanZScore) {
  let score = 0, weights = 0;

  if (piotroskiScore !== null) {
    score += (piotroskiScore / 9) * 100 * 0.30;
    weights += 0.30;
  }
  if (altmanZScore !== null) {
    score += Math.max(0, Math.min(altmanZScore / 3, 1)) * 100 * 0.25;
    weights += 0.25;
  }
  const de = parseNum(d.debt_to_equity);
  if (de !== null) {
    score += Math.max(0, 100 - de * 25) * 0.20;
    weights += 0.20;
  }
  const ebit = parseNum(d.operating_income);
  const intExp = parseNum(d.interest_expense);
  if (ebit !== null && intExp !== null && intExp > 0) {
    const ic = ebit / intExp;
    score += (Math.min(ic, 10) / 10) * 100 * 0.15;
    weights += 0.15;
  }
  const pledged = parseNum(d.promoter_pledged);
  if (pledged !== null) {
    score += Math.max(0, 100 - pledged * 5) * 0.10;
    weights += 0.10;
  }
  return weights > 0 ? Math.round(score / weights * 100) / 100 : null;
}

/**
 * Pillar 3: Earnings Quality Score V2 (0-100)
 * OCF/NI(35%) + FCF Yield(35%) + Accruals(30%)
 */
function calculateEarningsQualityScoreV2(d) {
  let score = 0, weights = 0;

  const ocf = parseNum(d.operating_cash_flow);
  const ni = parseNum(d.net_income);
  if (ocf !== null && ni !== null && ni > 0) {
    const ratio = ocf / ni;
    score += Math.max(0, Math.min(ratio / 1.3, 1)) * 100 * 0.35;
    weights += 0.35;
  }
  const fcf = parseNum(d.free_cash_flow);
  const mc = parseNum(d.market_cap);
  if (fcf !== null && mc && mc > 0 && fcf > 0) {
    const fcfYield = (fcf / mc) * 100;
    score += Math.max(0, Math.min(fcfYield / 8, 1)) * 100 * 0.35;
    weights += 0.35;
  }
  const ta = parseNum(d.total_assets);
  if (ni !== null && ocf !== null && ta && ta > 0) {
    const accruals = (ni - ocf) / ta;
    // accruals <= -0.05 is excellent (100), >= 0.10 is poor (0)
    score += Math.max(0, Math.min((0.10 - accruals) / 0.15, 1)) * 100 * 0.30;
    weights += 0.30;
  }
  return weights > 0 ? Math.round(score / weights * 100) / 100 : null;
}

/**
 * Pillar 4: Growth Score (0-100)
 * Revenue Growth YoY(40%) + EPS Growth YoY(40%) + Margin Expansion(20%)
 *
 * Returns { score, revenueGrowth, epsGrowth, marginExpansion }
 */
function calculateGrowthScore(d) {
  let score = 0, weights = 0;
  let revenueGrowth = null, epsGrowth = null, marginExpansion = null;

  const rev = parseNum(d.revenue);
  const prevRev = parseNum(d.prev_revenue);
  if (rev !== null && prevRev !== null && prevRev > 0) {
    revenueGrowth = Math.round(((rev - prevRev) / prevRev) * 10000) / 100;
    // Score: 0 at -10% or below, 100 at +25%
    const rg = Math.max(0, Math.min((revenueGrowth + 10) / 35, 1)) * 100;
    score += rg * 0.40;
    weights += 0.40;
  }

  const eps = parseNum(d.eps_diluted) || parseNum(d.eps);
  const prevEps = parseNum(d.prev_eps_diluted) || parseNum(d.prev_eps);
  if (eps !== null && prevEps !== null && prevEps > 0) {
    epsGrowth = Math.round(((eps - prevEps) / prevEps) * 10000) / 100;
    // Score: 0 at -15% or below, 100 at +30%
    const eg = Math.max(0, Math.min((epsGrowth + 15) / 45, 1)) * 100;
    score += eg * 0.40;
    weights += 0.40;
  }

  const currOm = parseNum(d.operating_income_ratio);
  const prevOm = parseNum(d.prev_operating_income_ratio);
  if (currOm !== null && prevOm !== null) {
    marginExpansion = Math.round((currOm - prevOm) * 10000) / 100; // ratio diff to pct points
    // Score: 0 at -3pp, 100 at +5pp
    const me = Math.max(0, Math.min((marginExpansion + 3) / 8, 1)) * 100;
    score += me * 0.20;
    weights += 0.20;
  }

  return {
    score: weights > 0 ? Math.round(score / weights * 100) / 100 : null,
    revenueGrowth,
    epsGrowth,
    marginExpansion
  };
}

/**
 * Pillar 5: Valuation Score (0-100)
 * PE(40%) + PB(30%) + Earnings Yield(30%)
 */
function calculateValuationScore(d) {
  let score = 0, weights = 0;

  const pe = parseNum(d.pe_ratio);
  if (pe !== null) {
    let peScore;
    if (pe < 0) peScore = 0;
    else if (pe <= 15) peScore = 100;
    else if (pe <= 25) peScore = 100 - ((pe - 15) / 10) * 40;
    else if (pe <= 40) peScore = 60 - ((pe - 25) / 15) * 40;
    else peScore = Math.max(0, 20 - ((pe - 40) / 20) * 20);
    score += peScore * 0.40;
    weights += 0.40;
  }

  const pb = parseNum(d.pb_ratio);
  if (pb !== null && pb > 0) {
    let pbScore;
    if (pb <= 1) pbScore = 100;
    else if (pb <= 3) pbScore = 100 - ((pb - 1) / 2) * 30;
    else if (pb <= 6) pbScore = 70 - ((pb - 3) / 3) * 40;
    else pbScore = Math.max(0, 30 - ((pb - 6) / 4) * 30);
    score += pbScore * 0.30;
    weights += 0.30;
  }

  const ebit = parseNum(d.operating_income);
  const mc = parseNum(d.market_cap);
  if (ebit !== null && mc && mc > 0 && ebit > 0) {
    const ey = (ebit / mc) * 100;
    score += Math.max(0, Math.min(ey / 15, 1)) * 100 * 0.30;
    weights += 0.30;
  }

  return weights > 0 ? Math.round(score / weights * 100) / 100 : null;
}

// ─── New Overall Quality Score ───────────────────────────────────────────────

function calculateNewOverallScore(pillars) {
  const components = [
    { score: pillars.profitability, weight: 0.25 },
    { score: pillars.financialStrength, weight: 0.20 },
    { score: pillars.earningsQuality, weight: 0.20 },
    { score: pillars.growth, weight: 0.15 },
    { score: pillars.valuation, weight: 0.20 },
  ];

  let totalScore = 0, totalWeight = 0;
  for (const c of components) {
    if (c.score !== null && c.score !== undefined) {
      totalScore += c.score * c.weight;
      totalWeight += c.weight;
    }
  }
  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function calculateQualityScoresFMP() {
  try {
    console.log('🔄 Calculating quality scores (5-Pillar System)...\n');

    // Ensure new columns exist
    await db.query(`
      ALTER TABLE stock_quality_scores
        ADD COLUMN IF NOT EXISTS profitability_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS financial_strength_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS earnings_quality_score_v2 NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS growth_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS valuation_score NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS revenue_growth_yoy NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS eps_growth_yoy NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS margin_expansion NUMERIC(8,2)
    `);

    // Query FMP raw tables with LATERAL join for prior period
    const result = await db.query(`
      SELECT
        s.id AS stock_id,
        s.symbol,
        s.company_name,
        -- Quote data
        sq.market_cap,
        sq.pe_ratio AS quote_pe,
        -- Current income statement
        fi.revenue,
        fi.operating_income,
        fi.net_income,
        fi.ebitda,
        fi.eps,
        fi.eps_diluted,
        fi.interest_expense,
        fi.gross_profit_ratio,
        fi.operating_income_ratio,
        fi.net_income_ratio,
        -- Prior period income statement (for growth)
        fi_prev.revenue AS prev_revenue,
        fi_prev.eps AS prev_eps,
        fi_prev.eps_diluted AS prev_eps_diluted,
        fi_prev.operating_income_ratio AS prev_operating_income_ratio,
        -- Balance sheet
        bs.total_assets,
        bs.total_current_assets,
        bs.total_current_liabilities,
        bs.total_liabilities,
        bs.total_stockholders_equity,
        bs.total_debt,
        -- Cash flow
        cf.operating_cash_flow,
        cf.free_cash_flow,
        -- Key metrics
        km.pe_ratio,
        km.pb_ratio,
        km.debt_to_equity,
        km.current_ratio,
        km.roe,
        km.roa,
        km.roce,
        -- Shareholding
        sp.promoter_pledged
      FROM stocks s
      -- Latest stock quote
      LEFT JOIN LATERAL (
        SELECT market_cap, pe_ratio
        FROM stock_quotes
        WHERE fmp_symbol = s.symbol
        ORDER BY fetch_date DESC LIMIT 1
      ) sq ON true
      -- Latest income statement
      LEFT JOIN LATERAL (
        SELECT *
        FROM stock_financials
        WHERE fmp_symbol = s.symbol AND revenue IS NOT NULL
        ORDER BY period_end DESC LIMIT 1
      ) fi ON true
      -- Prior period income statement (for growth calculation)
      LEFT JOIN LATERAL (
        SELECT revenue, eps, eps_diluted, operating_income_ratio
        FROM stock_financials
        WHERE fmp_symbol = s.symbol
          AND period_end < fi.period_end
          AND revenue IS NOT NULL
        ORDER BY period_end DESC LIMIT 1
      ) fi_prev ON fi.period_end IS NOT NULL
      -- Latest balance sheet
      LEFT JOIN LATERAL (
        SELECT total_assets, total_current_assets, total_current_liabilities,
               total_liabilities, total_stockholders_equity, total_debt
        FROM stock_balance_sheet
        WHERE fmp_symbol = s.symbol
        ORDER BY period_end DESC LIMIT 1
      ) bs ON true
      -- Latest cash flow
      LEFT JOIN LATERAL (
        SELECT operating_cash_flow, free_cash_flow
        FROM stock_cash_flow
        WHERE fmp_symbol = s.symbol
        ORDER BY period_end DESC LIMIT 1
      ) cf ON true
      -- Latest key metrics
      LEFT JOIN LATERAL (
        SELECT pe_ratio, pb_ratio, debt_to_equity, current_ratio,
               roe, roa, roce AS roce
        FROM stock_key_metrics
        WHERE fmp_symbol = s.symbol
        ORDER BY period_end DESC LIMIT 1
      ) km ON true
      -- Latest shareholding pattern
      LEFT JOIN LATERAL (
        SELECT promoter_pledged
        FROM shareholding_pattern
        WHERE stock_id = s.id
        ORDER BY date DESC LIMIT 1
      ) sp ON true
      WHERE fi.revenue IS NOT NULL
      ORDER BY s.symbol
    `);

    const stocks = result.rows;
    console.log(`Found ${stocks.length} stocks with fundamental data\n`);

    if (stocks.length === 0) {
      console.log('No fundamental data found. Run fetch_fmp_fundamentals.js first.');
      process.exit(1);
    }

    let processed = 0, saved = 0, skipped = 0;
    let pillarCounts = { profitability: 0, strength: 0, earnings: 0, growth: 0, valuation: 0 };

    for (const d of stocks) {
      try {
        if (!d.stock_id) { skipped++; processed++; continue; }

        // Derive margin percentages from ratios if not available separately
        if (d.operating_income_ratio !== null && d.operating_income_ratio !== undefined) {
          d.operating_margin = parseNum(d.operating_income_ratio) * 100;
        }
        if (d.net_income_ratio !== null && d.net_income_ratio !== undefined) {
          d.net_margin = parseNum(d.net_income_ratio) * 100;
        }
        // ROE/ROCE from key_metrics are decimals (0.15 = 15%), convert to pct
        d.roe_pct = parseNum(d.roe) !== null ? parseNum(d.roe) * 100 : null;
        d.roce_pct = parseNum(d.roce) !== null ? parseNum(d.roce) * 100 : null;

        // ── Standalone scores ──
        const piotroski = calculatePiotroskiScore(d);
        const altmanZ = calculateAltmanZScore(d);
        const magicFormula = calculateMagicFormulaScore(d);
        const canslim = calculateCANSLIMScore(d);
        const fhScore = calculateFinancialHealthScore(d);
        const mqScore = calculateManagementQualityScore(d);
        const eqScore = calculateEarningsQualityScore(d);

        // ── 5-Pillar scores ──
        const profitability = calculateProfitabilityScore(d);
        const financialStrength = calculateFinancialStrengthScore(d, piotroski, altmanZ);
        const earningsQualityV2 = calculateEarningsQualityScoreV2(d);
        const growthResult = calculateGrowthScore(d);
        const valuation = calculateValuationScore(d);

        const overall = calculateNewOverallScore({
          profitability,
          financialStrength,
          earningsQuality: earningsQualityV2,
          growth: growthResult.score,
          valuation
        });

        // Track pillar coverage
        if (profitability !== null) pillarCounts.profitability++;
        if (financialStrength !== null) pillarCounts.strength++;
        if (earningsQualityV2 !== null) pillarCounts.earnings++;
        if (growthResult.score !== null) pillarCounts.growth++;
        if (valuation !== null) pillarCounts.valuation++;

        await db.query(`
          INSERT INTO stock_quality_scores (
            stock_id, calculated_date,
            piotroski_score, magic_formula_score, canslim_score,
            altman_z_score, financial_health_score,
            management_quality_score, earnings_quality_score,
            overall_quality_score,
            profitability_score, financial_strength_score,
            earnings_quality_score_v2, growth_score, valuation_score,
            revenue_growth_yoy, eps_growth_yoy, margin_expansion
          ) VALUES ($1, CURRENT_DATE, $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (stock_id, calculated_date) DO UPDATE SET
            piotroski_score = EXCLUDED.piotroski_score,
            magic_formula_score = EXCLUDED.magic_formula_score,
            canslim_score = EXCLUDED.canslim_score,
            altman_z_score = EXCLUDED.altman_z_score,
            financial_health_score = EXCLUDED.financial_health_score,
            management_quality_score = EXCLUDED.management_quality_score,
            earnings_quality_score = EXCLUDED.earnings_quality_score,
            overall_quality_score = EXCLUDED.overall_quality_score,
            profitability_score = EXCLUDED.profitability_score,
            financial_strength_score = EXCLUDED.financial_strength_score,
            earnings_quality_score_v2 = EXCLUDED.earnings_quality_score_v2,
            growth_score = EXCLUDED.growth_score,
            valuation_score = EXCLUDED.valuation_score,
            revenue_growth_yoy = EXCLUDED.revenue_growth_yoy,
            eps_growth_yoy = EXCLUDED.eps_growth_yoy,
            margin_expansion = EXCLUDED.margin_expansion,
            updated_at = CURRENT_TIMESTAMP
        `, [
          d.stock_id,
          piotroski, magicFormula, canslim, altmanZ,
          fhScore, mqScore, eqScore, overall,
          profitability, financialStrength, earningsQualityV2,
          growthResult.score, valuation,
          growthResult.revenueGrowth, growthResult.epsGrowth, growthResult.marginExpansion
        ]);

        saved++;
        processed++;
        if (processed % 100 === 0) {
          process.stdout.write(`  Processed ${processed}/${stocks.length}...\r`);
        }
      } catch (error) {
        console.error(`Error processing ${d.symbol}:`, error.message);
        processed++;
      }
    }

    console.log(`\n\n${'─'.repeat(55)}`);
    console.log(`  Processed: ${processed} stocks`);
    console.log(`  Saved:     ${saved}`);
    console.log(`  Skipped:   ${skipped} (no stock_id match)`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`  Pillar coverage:`);
    console.log(`    Profitability:      ${pillarCounts.profitability}/${saved}`);
    console.log(`    Financial Strength: ${pillarCounts.strength}/${saved}`);
    console.log(`    Earnings Quality:   ${pillarCounts.earnings}/${saved}`);
    console.log(`    Growth:             ${pillarCounts.growth}/${saved}`);
    console.log(`    Valuation:          ${pillarCounts.valuation}/${saved}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`\nNext: node compute_stock_ratings_cache.js`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

calculateQualityScoresFMP();
