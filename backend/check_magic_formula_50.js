import db from './src/db.js';

async function checkMagicFormula50() {
  try {
    console.log('📊 Checking Magic Formula Scores Near 50 (Single Component Stocks)\n');

    const result = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        sqs.magic_formula_score,
        sf.pe_ratio,
        sf.roce_pct,
        sf.roce_fmp
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE sqs.magic_formula_score BETWEEN 45 AND 55
      ORDER BY sqs.magic_formula_score DESC
      LIMIT 20
    `);

    console.log('Symbol'.padEnd(20), 'Magic', 'P/E', 'ROCE%', 'Status');
    console.log('-'.repeat(75));

    let onlyRoce = 0;
    let onlyPE = 0;
    let hasBoth = 0;
    let hasNeither = 0;

    result.rows.forEach(r => {
      const pe = r.pe_ratio ? parseFloat(r.pe_ratio) : null;
      const roce = r.roce_pct ? parseFloat(r.roce_pct) : (r.roce_fmp ? parseFloat(r.roce_fmp) : null);

      let status = '';
      if (!pe && roce) {
        status = '✓ Only ROCE';
        onlyRoce++;
      } else if (pe && !roce) {
        status = '✓ Only P/E';
        onlyPE++;
      } else if (pe && roce) {
        status = '⚠️ Has both (low values)';
        hasBoth++;
      } else {
        status = '❌ Neither';
        hasNeither++;
      }

      console.log(
        r.symbol.padEnd(20),
        String(r.magic_formula_score || '-').padStart(5),
        String(pe ? pe.toFixed(1) : '-').padStart(6),
        String(roce ? roce.toFixed(1) : '-').padStart(6),
        status
      );
    });

    console.log('\n📈 Summary of Stocks Near 50 Score:');
    console.log(`   Only ROCE (no P/E): ${onlyRoce}`);
    console.log(`   Only P/E (no ROCE): ${onlyPE}`);
    console.log(`   Has both (low values): ${hasBoth}`);
    console.log(`   Neither: ${hasNeither}`);

    // Check distribution of stocks with only ROCE (should be capped at 50)
    console.log('\n📊 All Stocks with Only ROCE (no P/E):\n');
    const onlyRoceAll = await db.query(`
      SELECT
        s.symbol,
        sqs.magic_formula_score,
        sf.roce_pct,
        sf.roce_fmp
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE (sf.pe_ratio IS NULL OR sf.pe_ratio = 0)
        AND (sf.roce_pct > 0 OR sf.roce_fmp > 0)
        AND sqs.magic_formula_score IS NOT NULL
      ORDER BY sqs.magic_formula_score DESC
      LIMIT 10
    `);

    console.log('Symbol'.padEnd(20), 'Magic', 'ROCE%', 'Expected');
    console.log('-'.repeat(60));

    onlyRoceAll.rows.forEach(r => {
      const roce = r.roce_pct ? parseFloat(r.roce_pct) : (r.roce_fmp ? parseFloat(r.roce_fmp) : null);
      const expectedScore = roce > 30 ? 50 : Math.round((roce / 30) * 50);

      console.log(
        r.symbol.padEnd(20),
        String(r.magic_formula_score).padStart(5),
        String(roce ? roce.toFixed(1) : '-').padStart(6),
        String(expectedScore).padStart(8)
      );
    });

    // Check if any stocks with only ROCE have score > 50
    const overLimit = await db.query(`
      SELECT COUNT(*) as count
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      WHERE (sf.pe_ratio IS NULL OR sf.pe_ratio = 0)
        AND (sf.roce_pct > 0 OR sf.roce_fmp > 0)
        AND sqs.magic_formula_score > 50
    `);

    console.log(`\n✅ Verification: ${overLimit.rows[0].count} stocks with only ROCE have score > 50`);
    console.log('   (Should be 0 after the fix)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMagicFormula50();
