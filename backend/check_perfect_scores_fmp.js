import db from './src/db.js';

async function checkPerfectScores() {
  try {
    console.log('📊 Checking stocks with perfect scores...\n');

    // Stocks with Magic Formula = 100
    const magicFormula100 = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        sf.pe_ratio,
        sf.roce_pct,
        sf.roe_pct,
        sf.revenue,
        sf.net_margin,
        sf.operating_margin,
        sf.current_ratio,
        sf.debt_to_equity,
        sq.magic_formula_score,
        sq.canslim_score,
        sq.overall_quality_score
      FROM stock_quality_scores sq
      JOIN stocks s ON s.id = sq.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE sq.magic_formula_score = 100
      ORDER BY s.symbol
      LIMIT 20
    `);

    console.log(`🎯 Stocks with Magic Formula = 100: ${magicFormula100.rows.length}\n`);

    if (magicFormula100.rows.length > 0) {
      console.log('Sample stocks:');
      magicFormula100.rows.slice(0, 10).forEach(row => {
        const earningsYield = row.pe_ratio > 0 ? (100 / row.pe_ratio).toFixed(2) : 'N/A';
        console.log(`\n${row.symbol} - ${row.company_name}`);
        console.log(`  P/E: ${row.pe_ratio || 'NULL'} (Earnings Yield: ${earningsYield}%)`);
        console.log(`  ROCE: ${row.roce_pct || 'NULL'}%`);
        console.log(`  ROE: ${row.roe_pct || 'NULL'}%`);
        console.log(`  Revenue: ₹${row.revenue ? (parseFloat(row.revenue) / 1e7).toFixed(0) : 'NULL'} Cr`);
        console.log(`  Magic Formula: ${row.magic_formula_score}`);
        console.log(`  CANSLIM: ${row.canslim_score}`);
      });
    }

    // Stocks with CANSLIM >= 90
    const canslim90 = await db.query(`
      SELECT COUNT(*) as count
      FROM stock_quality_scores
      WHERE canslim_score >= 90
    `);

    console.log(`\n\n🎯 Stocks with CANSLIM ≥ 90: ${canslim90.rows[0].count}\n`);

    // Distribution of Magic Formula scores
    const distribution = await db.query(`
      SELECT
        CASE
          WHEN magic_formula_score = 100 THEN '100 (Perfect)'
          WHEN magic_formula_score >= 90 THEN '90-99 (Excellent)'
          WHEN magic_formula_score >= 80 THEN '80-89 (Very Good)'
          WHEN magic_formula_score >= 70 THEN '70-79 (Good)'
          WHEN magic_formula_score >= 60 THEN '60-69 (Above Average)'
          ELSE 'Below 60'
        END as score_range,
        COUNT(*) as count
      FROM stock_quality_scores
      WHERE magic_formula_score IS NOT NULL
      GROUP BY score_range
      ORDER BY MIN(magic_formula_score) DESC
    `);

    console.log('📈 Magic Formula Score Distribution:\n');
    distribution.rows.forEach(row => {
      const percentage = '█'.repeat(Math.round(row.count / 10));
      console.log(`${row.score_range.padEnd(25)} ${row.count.toString().padStart(4)} ${percentage}`);
    });

    // Check if P/E and ROCE data is missing
    const missingData = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(sf.pe_ratio) as with_pe,
        COUNT(sf.roce_pct) as with_roce,
        COUNT(sf.roe_pct) as with_roe
      FROM stock_quality_scores sq
      JOIN stocks s ON s.id = sq.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE sq.magic_formula_score IS NOT NULL
    `);

    console.log('\n\n📊 Data Availability:');
    console.log(`  Total stocks with scores: ${missingData.rows[0].total}`);
    console.log(`  With P/E ratio: ${missingData.rows[0].with_pe} (${(missingData.rows[0].with_pe / missingData.rows[0].total * 100).toFixed(1)}%)`);
    console.log(`  With ROCE: ${missingData.rows[0].with_roce} (${(missingData.rows[0].with_roce / missingData.rows[0].total * 100).toFixed(1)}%)`);
    console.log(`  With ROE: ${missingData.rows[0].with_roe} (${(missingData.rows[0].with_roe / missingData.rows[0].total * 100).toFixed(1)}%)`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPerfectScores();
