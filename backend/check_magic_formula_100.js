import db from './src/db.js';

async function checkMagicFormula100() {
  try {
    console.log('📊 Investigating Magic Formula Score = 100\n');

    // Get stocks with Magic Formula = 100
    const result = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        sqs.magic_formula_score,
        sqs.piotroski_score,
        sqs.overall_quality_score,
        -- Get fundamental data
        sf.pe_ratio,
        sf.roce_pct,
        sf.roce_fmp,
        sf.market_cap_cr
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE sqs.magic_formula_score >= 95
      ORDER BY sqs.magic_formula_score DESC, s.symbol
      LIMIT 20
    `);

    console.log('Symbol'.padEnd(20), 'Company'.padEnd(30), 'Magic', 'P/E', 'ROCE%', 'EY%', 'Overall');
    console.log('-'.repeat(110));

    result.rows.forEach(r => {
      const pe = r.pe_ratio ? parseFloat(r.pe_ratio) : null;
      const roce = r.roce_pct ? parseFloat(r.roce_pct) : (r.roce_fmp ? parseFloat(r.roce_fmp) : null);

      // Calculate Earnings Yield (inverse of P/E)
      const earningsYield = pe && pe > 0 ? (100 / pe) : null;

      console.log(
        r.symbol.padEnd(20),
        (r.company_name || 'N/A').substring(0, 28).padEnd(30),
        String(r.magic_formula_score ? parseFloat(r.magic_formula_score).toFixed(0) : '-').padStart(5),
        String(pe ? pe.toFixed(1) : '-').padStart(6),
        String(roce ? roce.toFixed(1) : '-').padStart(6),
        String(earningsYield ? earningsYield.toFixed(1) : '-').padStart(6),
        String(r.overall_quality_score || '-').padStart(7)
      );
    });

    // Check the Magic Formula calculation logic
    console.log('\n📝 Magic Formula Calculation Logic:\n');
    console.log('The formula combines:');
    console.log('1. Earnings Yield = (100 / P/E) → Higher is better (cheap stocks)');
    console.log('2. ROCE (Return on Capital Employed) → Higher is better (efficient capital use)');
    console.log('\nScore = 100 means BOTH metrics are at maximum normalized values');

    // Get distribution
    console.log('\n📊 Magic Formula Score Distribution:\n');
    const distribution = await db.query(`
      SELECT
        CASE
          WHEN magic_formula_score >= 90 THEN '90-100 (Excellent)'
          WHEN magic_formula_score >= 70 THEN '70-89 (Very Good)'
          WHEN magic_formula_score >= 50 THEN '50-69 (Good)'
          WHEN magic_formula_score >= 30 THEN '30-49 (Average)'
          ELSE '0-29 (Poor)'
        END as score_range,
        COUNT(*) as count,
        AVG(magic_formula_score) as avg_score
      FROM stock_quality_scores
      WHERE magic_formula_score IS NOT NULL
      GROUP BY 1
      ORDER BY MIN(magic_formula_score) DESC
    `);

    distribution.rows.forEach(r => {
      console.log(
        r.score_range.padEnd(25),
        String(r.count).padStart(5) + ' stocks',
        '  Avg:',
        parseFloat(r.avg_score).toFixed(1)
      );
    });

    // Check the actual calculation for a sample
    console.log('\n🔍 Sample Calculation Verification:\n');
    const sample = await db.query(`
      SELECT
        s.symbol,
        sf.pe_ratio,
        sf.roce_pct,
        sf.roce_fmp,
        sqs.magic_formula_score
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE sqs.magic_formula_score = 100
      LIMIT 3
    `);

    sample.rows.forEach(r => {
      const pe = r.pe_ratio ? parseFloat(r.pe_ratio) : null;
      const roce = r.roce_pct ? parseFloat(r.roce_pct) : (r.roce_fmp ? parseFloat(r.roce_fmp) : null);
      const earningsYield = pe && pe > 0 ? (100 / pe) : null;

      console.log(`\n${r.symbol}:`);
      console.log(`  P/E Ratio: ${pe ? pe.toFixed(2) : 'NULL'}`);
      console.log(`  Earnings Yield: ${earningsYield ? earningsYield.toFixed(2) + '%' : 'NULL'} (1/P/E)`);
      console.log(`  ROCE: ${roce ? roce.toFixed(2) + '%' : 'NULL'}`);
      console.log(`  Magic Formula Score: ${r.magic_formula_score}`);

      // Show why it's 100
      if (earningsYield && earningsYield > 20) {
        console.log(`  → Earnings Yield > 20% = Max score (stock is very cheap)`);
      }
      if (roce && roce > 30) {
        console.log(`  → ROCE > 30% = Max score (very efficient capital use)`);
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMagicFormula100();
