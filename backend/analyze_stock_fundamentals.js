import db from './src/db.js';

async function analyzeStockFundamentals() {
  try {
    console.log('📊 Analyzing stock_fundamentals VIEW\n');

    // Get total count
    const totalResult = await db.query('SELECT COUNT(*) FROM stock_fundamentals');
    const total = parseInt(totalResult.rows[0].count);
    console.log(`Total stocks: ${total}\n`);

    // Get column stats
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(pe_ratio) as pe_ratio,
        COUNT(pb_ratio) as pb_ratio,
        COUNT(eps_diluted) as eps_diluted,
        COUNT(roe_pct) as roe_pct,
        COUNT(roe_fmp) as roe_fmp,
        COUNT(roce_pct) as roce_pct,
        COUNT(roce_fmp) as roce_fmp,
        COUNT(debt_to_equity) as debt_to_equity,
        COUNT(current_ratio) as current_ratio,
        COUNT(net_margin) as net_margin,
        COUNT(operating_margin) as operating_margin,
        COUNT(ebitda_margin) as ebitda_margin,
        COUNT(free_cash_flow) as free_cash_flow,
        COUNT(operating_cash_flow) as operating_cash_flow,
        COUNT(fcf_yield_pct) as fcf_yield_pct,
        COUNT(revenue) as revenue,
        COUNT(net_income) as net_income,
        COUNT(ebitda) as ebitda,
        COUNT(total_assets) as total_assets,
        COUNT(total_debt) as total_debt,
        COUNT(cash_and_equivalents) as cash_and_equivalents,
        COUNT(total_stockholders_equity) as total_stockholders_equity,
        COUNT(dividend_yield) as dividend_yield
      FROM stock_fundamentals
    `;

    const statsResult = await db.query(statsQuery);
    const stats = statsResult.rows[0];

    console.log('Column Coverage:\n');
    const columns = [
      'pe_ratio', 'pb_ratio', 'eps_diluted',
      'roe_pct', 'roe_fmp', 'roce_pct', 'roce_fmp',
      'debt_to_equity', 'current_ratio',
      'net_margin', 'operating_margin', 'ebitda_margin',
      'free_cash_flow', 'operating_cash_flow', 'fcf_yield_pct',
      'revenue', 'net_income', 'ebitda',
      'total_assets', 'total_debt', 'cash_and_equivalents',
      'total_stockholders_equity', 'dividend_yield'
    ];

    const coverage = columns.map(col => {
      const count = parseInt(stats[col]);
      const pct = (count / total * 100).toFixed(1);
      return { col, count, pct };
    });

    // Sort by coverage percentage
    coverage.sort((a, b) => b.pct - a.pct);

    // Group by coverage level
    const excellent = coverage.filter(c => c.pct >= 90);
    const good = coverage.filter(c => c.pct >= 70 && c.pct < 90);
    const partial = coverage.filter(c => c.pct >= 30 && c.pct < 70);
    const poor = coverage.filter(c => c.pct < 30);

    console.log('✅ Excellent Coverage (≥90%):');
    excellent.forEach(c => console.log(`  ${c.col.padEnd(30)} ${c.count}/${total} (${c.pct}%)`));

    console.log('\n🟡 Good Coverage (70-89%):');
    good.forEach(c => console.log(`  ${c.col.padEnd(30)} ${c.count}/${total} (${c.pct}%)`));

    console.log('\n🟠 Partial Coverage (30-69%):');
    partial.forEach(c => console.log(`  ${c.col.padEnd(30)} ${c.count}/${total} (${c.pct}%)`));

    console.log('\n❌ Poor Coverage (<30%):');
    poor.forEach(c => console.log(`  ${c.col.padEnd(30)} ${c.count}/${total} (${c.pct}%)`));

    // Check what FMP tables have
    console.log('\n\n📦 FMP Tables Data:\n');

    const fmpTables = [
      { name: 'stock_quotes', key: 'current_price' },
      { name: 'stock_financials', key: 'revenue' },
      { name: 'stock_balance_sheet', key: 'total_assets' },
      { name: 'stock_cash_flow', key: 'operating_cash_flow' },
      { name: 'stock_key_metrics', key: 'roe' }
    ];

    for (const table of fmpTables) {
      const countResult = await db.query(`SELECT COUNT(*) FROM ${table.name}`);
      const distinctResult = await db.query(`SELECT COUNT(DISTINCT fmp_symbol) FROM ${table.name}`);
      const withDataResult = await db.query(`SELECT COUNT(DISTINCT fmp_symbol) FROM ${table.name} WHERE ${table.key} IS NOT NULL`);

      console.log(`${table.name}:`);
      console.log(`  Total records: ${countResult.rows[0].count}`);
      console.log(`  Distinct symbols: ${distinctResult.rows[0].count}`);
      console.log(`  With ${table.key}: ${withDataResult.rows[0].count}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeStockFundamentals();
