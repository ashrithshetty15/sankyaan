import db from './src/db.js';

async function checkPEData() {
  try {
    // Check stock_key_metrics for P/E
    const keyMetrics = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(pe_ratio) as with_pe,
        AVG(pe_ratio) as avg_pe
      FROM stock_key_metrics
      WHERE pe_ratio IS NOT NULL AND pe_ratio > 0
    `);

    console.log('📊 P/E in stock_key_metrics:');
    console.log(`  Total records: ${keyMetrics.rows[0].total}`);
    console.log(`  With P/E: ${keyMetrics.rows[0].with_pe}`);
    console.log(`  Avg P/E: ${keyMetrics.rows[0].avg_pe ? parseFloat(keyMetrics.rows[0].avg_pe).toFixed(2) : 'N/A'}`);

    // Check stock_financials for EPS
    const financials = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(eps_diluted) as with_eps
      FROM stock_financials
      WHERE eps_diluted IS NOT NULL AND eps_diluted > 0
    `);

    console.log('\n📊 EPS in stock_financials:');
    console.log(`  Total records: ${financials.rows[0].total}`);
    console.log(`  With EPS: ${financials.rows[0].with_eps}`);

    // Sample with P/E from key_metrics
    const sample = await db.query(`
      SELECT
        km.fmp_symbol,
        km.pe_ratio,
        km.period_end
      FROM stock_key_metrics km
      WHERE km.pe_ratio IS NOT NULL AND km.pe_ratio > 0
      ORDER BY km.period_end DESC
      LIMIT 5
    `);

    console.log('\n📊 Sample stocks with P/E from key_metrics:');
    sample.rows.forEach(row => {
      console.log(`  ${row.fmp_symbol}: P/E = ${row.pe_ratio} (${row.period_end})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPEData();
