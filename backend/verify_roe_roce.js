import db from './src/db.js';

async function verify() {
  try {
    // Check stock_key_metrics table directly
    console.log('📊 Sample stocks from stock_key_metrics TABLE:\n');
    const tableResult = await db.query(`
      SELECT fmp_symbol, period_end, roe, roce, pe_ratio
      FROM stock_key_metrics
      WHERE fmp_symbol IN ('RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS')
      ORDER BY fmp_symbol, period_end DESC
    `);

    let currentSymbol = '';
    tableResult.rows.forEach(row => {
      if (row.fmp_symbol !== currentSymbol) {
        if (currentSymbol !== '') console.log('');
        currentSymbol = row.fmp_symbol;
        console.log(`${row.fmp_symbol}:`);
      }
      const roe = row.roe ? (parseFloat(row.roe) * 100).toFixed(2) + '%' : 'NULL';
      const roce = row.roce ? (parseFloat(row.roce) * 100).toFixed(2) + '%' : 'NULL';
      const pe = row.pe_ratio ? parseFloat(row.pe_ratio).toFixed(2) : 'NULL';
      console.log(`  ${row.period_end.toISOString().split('T')[0]} - ROE=${roe.padStart(8)} ROCE=${roce.padStart(8)} P/E=${pe.padStart(8)}`);
    });

    // Check stock_fundamentals VIEW
    console.log('\n\n📊 Sample stocks from stock_fundamentals VIEW:\n');
    const viewResult = await db.query(`
      SELECT fmp_symbol, roe_fmp, roce_fmp, pe_ratio
      FROM stock_fundamentals
      WHERE fmp_symbol IN ('RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS')
      ORDER BY fmp_symbol
    `);

    viewResult.rows.forEach(row => {
      const roe = row.roe_fmp ? (parseFloat(row.roe_fmp) * 100).toFixed(2) + '%' : 'NULL';
      const roce = row.roce_fmp ? (parseFloat(row.roce_fmp) * 100).toFixed(2) + '%' : 'NULL';
      const pe = row.pe_ratio ? parseFloat(row.pe_ratio).toFixed(2) : 'NULL';
      console.log(`${row.fmp_symbol.padEnd(15)} ROE=${roe.padStart(8)} ROCE=${roce.padStart(8)} P/E=${pe.padStart(8)}`);
    });

    // Check overall stats
    console.log('\n📈 Overall Statistics:\n');
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_stocks,
        COUNT(CASE WHEN roe_fmp IS NOT NULL THEN 1 END) as with_roe,
        COUNT(CASE WHEN roce_fmp IS NOT NULL THEN 1 END) as with_roce,
        COUNT(CASE WHEN pe_ratio IS NOT NULL THEN 1 END) as with_pe
      FROM stock_fundamentals
    `);

    const stats = statsResult.rows[0];
    console.log(`Total stocks: ${stats.total_stocks}`);
    console.log(`With ROE: ${stats.with_roe} (${(stats.with_roe / stats.total_stocks * 100).toFixed(1)}%)`);
    console.log(`With ROCE: ${stats.with_roce} (${(stats.with_roce / stats.total_stocks * 100).toFixed(1)}%)`);
    console.log(`With P/E: ${stats.with_pe} (${(stats.with_pe / stats.total_stocks * 100).toFixed(1)}%)`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verify();
