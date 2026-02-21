import db from './src/db.js';

async function checkPECoverage() {
  try {
    console.log('📊 Checking P/E Ratio Coverage\n');

    // Overall coverage
    const coverage = await db.query(`
      SELECT
        COUNT(*) as total_stocks,
        COUNT(pe_ratio) as has_pe,
        COUNT(*) FILTER (WHERE pe_ratio IS NULL) as missing_pe
      FROM stock_fundamentals
    `);

    const c = coverage.rows[0];
    console.log('Overall Coverage:');
    console.log(`  Total stocks: ${c.total_stocks}`);
    console.log(`  With P/E: ${c.has_pe} (${(c.has_pe / c.total_stocks * 100).toFixed(1)}%)`);
    console.log(`  Missing P/E: ${c.missing_pe} (${(c.missing_pe / c.total_stocks * 100).toFixed(1)}%)`);

    // Stocks with Magic Formula = 100 but no P/E
    console.log('\n🔍 Stocks with Magic Formula ≥ 95 and NULL P/E:\n');
    const missingPE = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        sqs.magic_formula_score,
        sf.pe_ratio,
        sf.roce_pct,
        sf.roce_fmp,
        sf.eps_diluted,
        sq.current_price
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = s.symbol
      LEFT JOIN stock_quotes sq ON sq.fmp_symbol = s.symbol
      WHERE sqs.magic_formula_score >= 95
        AND sf.pe_ratio IS NULL
      ORDER BY sqs.magic_formula_score DESC
      LIMIT 10
    `);

    console.log('Symbol'.padEnd(20), 'Company'.padEnd(30), 'Magic', 'Price', 'EPS', 'Calc P/E');
    console.log('-'.repeat(100));

    missingPE.rows.forEach(r => {
      const price = r.current_price ? parseFloat(r.current_price) : null;
      const eps = r.eps_diluted ? parseFloat(r.eps_diluted) : null;
      const calcPE = price && eps && eps > 0 ? (price / eps) : null;

      console.log(
        r.symbol.padEnd(20),
        (r.company_name || 'N/A').substring(0, 28).padEnd(30),
        String(r.magic_formula_score ? parseFloat(r.magic_formula_score).toFixed(0) : '-').padStart(5),
        String(price ? price.toFixed(2) : '-').padStart(8),
        String(eps ? eps.toFixed(2) : '-').padStart(8),
        String(calcPE ? calcPE.toFixed(2) : '-').padStart(10)
      );
    });

    // Check FMP tables directly
    console.log('\n📊 P/E in FMP Tables:\n');

    const fmpKeyMetrics = await db.query(`
      SELECT COUNT(*) as total, COUNT(pe_ratio) as has_pe
      FROM stock_key_metrics
    `);
    console.log(`stock_key_metrics: ${fmpKeyMetrics.rows[0].has_pe}/${fmpKeyMetrics.rows[0].total} (${(fmpKeyMetrics.rows[0].has_pe / fmpKeyMetrics.rows[0].total * 100).toFixed(1)}%)`);

    const fmpQuotes = await db.query(`
      SELECT COUNT(*) as total, COUNT(pe_ratio) as has_pe
      FROM stock_quotes
    `);
    console.log(`stock_quotes: ${fmpQuotes.rows[0].has_pe}/${fmpQuotes.rows[0].total} (${(fmpQuotes.rows[0].has_pe / fmpQuotes.rows[0].total * 100).toFixed(1)}%)`);

    // Sample with available data in FMP tables but NULL in view
    console.log('\n🔍 Checking for data mismatch...\n');
    const mismatch = await db.query(`
      SELECT
        km.fmp_symbol,
        km.pe_ratio as km_pe,
        sq.pe_ratio as sq_pe,
        sf.pe_ratio as view_pe
      FROM stock_key_metrics km
      LEFT JOIN stock_quotes sq ON sq.fmp_symbol = km.fmp_symbol
      LEFT JOIN stock_fundamentals sf ON sf.fmp_symbol = km.fmp_symbol
      WHERE km.pe_ratio IS NOT NULL
        AND sf.pe_ratio IS NULL
      LIMIT 5
    `);

    if (mismatch.rows.length > 0) {
      console.log('Found data mismatch! P/E exists in FMP tables but NULL in view:');
      mismatch.rows.forEach(r => {
        console.log(`  ${r.fmp_symbol}: km.pe_ratio=${r.km_pe}, sq.pe_ratio=${r.sq_pe}, view.pe_ratio=${r.view_pe}`);
      });
    } else {
      console.log('✅ No mismatch - view correctly reflects FMP tables');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPECoverage();
