import db from './src/db.js';

async function analyzeStockCoverage() {
  try {
    console.log('📊 Analyzing Stock Data Coverage\n');

    // 1. Stocks table
    const stocksCount = await db.query('SELECT COUNT(*) FROM stocks');
    console.log('1️⃣  stocks table:', stocksCount.rows[0].count, 'stocks');

    // 2. Stock quotes
    const quotesCount = await db.query('SELECT COUNT(*) FROM stock_quotes');
    console.log('2️⃣  stock_quotes table:', quotesCount.rows[0].count, 'stocks');

    // 3. FMP tables
    const financialsCount = await db.query('SELECT COUNT(DISTINCT fmp_symbol) FROM stock_financials');
    console.log('3️⃣  stock_financials (FMP):', financialsCount.rows[0].count, 'distinct symbols');

    const keyMetricsCount = await db.query('SELECT COUNT(DISTINCT fmp_symbol) FROM stock_key_metrics');
    console.log('4️⃣  stock_key_metrics (FMP):', keyMetricsCount.rows[0].count, 'distinct symbols');

    const balanceSheetCount = await db.query('SELECT COUNT(DISTINCT fmp_symbol) FROM stock_balance_sheet');
    console.log('5️⃣  stock_balance_sheet (FMP):', balanceSheetCount.rows[0].count, 'distinct symbols');

    // 4. Quality scores
    const qualityCount = await db.query('SELECT COUNT(*) FROM stock_quality_scores');
    console.log('6️⃣  stock_quality_scores:', qualityCount.rows[0].count, 'stocks');

    // 5. Check overlap - stocks with FMP data
    const overlap = await db.query(`
      SELECT COUNT(DISTINCT s.id)
      FROM stocks s
      WHERE EXISTS (
        SELECT 1 FROM stock_financials f WHERE f.fmp_symbol = s.symbol
      )
    `);
    console.log('\n7️⃣  Stocks (stocks table) that HAVE FMP data:', overlap.rows[0].count);

    // 6. Check stocks WITHOUT FMP data
    const noFmpData = await db.query(`
      SELECT COUNT(DISTINCT s.id)
      FROM stocks s
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_financials f WHERE f.fmp_symbol = s.symbol
      )
    `);
    console.log('8️⃣  Stocks (stocks table) WITHOUT FMP data:', noFmpData.rows[0].count);

    // 7. Sample stocks without FMP data
    console.log('\n📋 Sample 15 stocks WITHOUT FMP fundamental data:');
    const sampleNoFmp = await db.query(`
      SELECT s.symbol, s.company_name, s.sector
      FROM stocks s
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_financials f WHERE f.fmp_symbol = s.symbol
      )
      ORDER BY s.symbol
      LIMIT 15
    `);

    sampleNoFmp.rows.forEach((s, i) => {
      console.log(`   ${i+1}. ${s.symbol} - ${s.company_name || 'N/A'} (${s.sector || 'N/A'})`);
    });

    // 8. Check stocks with quotes but no FMP data
    console.log('\n📊 Stocks with QUOTES but NO FMP data:');
    const quotesNoFmp = await db.query(`
      SELECT COUNT(DISTINCT s.id)
      FROM stocks s
      JOIN stock_quotes q ON q.fmp_symbol = s.symbol
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_financials f WHERE f.fmp_symbol = s.symbol
      )
    `);
    console.log('   Count:', quotesNoFmp.rows[0].count);

    // 9. Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log('Total stocks in database:', stocksCount.rows[0].count);
    console.log('Stocks with FMP fundamentals:', overlap.rows[0].count);
    console.log('Stocks WITHOUT FMP fundamentals:', noFmpData.rows[0].count);
    console.log('Quality scores calculated:', qualityCount.rows[0].count);
    console.log('\n⚠️  Gap: ' + (parseInt(stocksCount.rows[0].count) - parseInt(qualityCount.rows[0].count)) + ' stocks missing quality scores');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeStockCoverage();
