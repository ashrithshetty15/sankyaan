import db from './src/db.js';

/**
 * Populate calculated metrics that FMP doesn't provide
 * - P/B ratio
 * - Debt to Equity
 * - Net Margin, Operating Margin, EBITDA Margin, Gross Profit Margin
 */

async function populateCalculatedMetrics() {
  try {
    console.log('🔧 Populating Calculated Metrics\n');

    // 1. Calculate and update P/B ratio in stock_key_metrics
    console.log('1️⃣  Calculating P/B Ratio...');
    const pbUpdate = await db.query(`
      UPDATE stock_key_metrics
      SET pb_ratio = subq.pb
      FROM (
        SELECT
          km.id,
          CASE
            WHEN bs.total_stockholders_equity > 0 THEN
              ROUND((q.market_cap / bs.total_stockholders_equity), 2)
            ELSE NULL
          END as pb
        FROM stock_key_metrics km
        JOIN stock_quotes q ON q.fmp_symbol = km.fmp_symbol
        JOIN stock_balance_sheet bs ON bs.fmp_symbol = km.fmp_symbol AND bs.period_end = km.period_end
        WHERE km.pb_ratio IS NULL
          AND bs.total_stockholders_equity IS NOT NULL
          AND q.market_cap IS NOT NULL
      ) subq
      WHERE stock_key_metrics.id = subq.id
    `);
    console.log(`   ✅ Updated ${pbUpdate.rowCount} records\n`);

    // 2. Calculate and update Debt to Equity in stock_key_metrics
    console.log('2️⃣  Calculating Debt to Equity...');
    const deUpdate = await db.query(`
      UPDATE stock_key_metrics km
      SET debt_to_equity = CASE
        WHEN bs.total_stockholders_equity > 0 THEN
          ROUND((bs.total_debt / bs.total_stockholders_equity), 2)
        ELSE NULL
      END
      FROM stock_balance_sheet bs
      WHERE bs.fmp_symbol = km.fmp_symbol
        AND bs.period_end = km.period_end
        AND km.debt_to_equity IS NULL
    `);
    console.log(`   ✅ Updated ${deUpdate.rowCount} records\n`);

    // 3. Calculate and update Net Income Ratio in stock_financials
    console.log('3️⃣  Calculating Net Income Margin...');
    const netMarginUpdate = await db.query(`
      UPDATE stock_financials
      SET net_income_ratio = CASE
        WHEN revenue > 0 THEN ROUND((net_income / revenue), 4)
        ELSE NULL
      END
      WHERE net_income_ratio IS NULL
        AND revenue IS NOT NULL
        AND net_income IS NOT NULL
    `);
    console.log(`   ✅ Updated ${netMarginUpdate.rowCount} records\n`);

    // 4. Calculate and update Operating Income Ratio
    console.log('4️⃣  Calculating Operating Margin...');
    const opMarginUpdate = await db.query(`
      UPDATE stock_financials
      SET operating_income_ratio = CASE
        WHEN revenue > 0 THEN ROUND((operating_income / revenue), 4)
        ELSE NULL
      END
      WHERE operating_income_ratio IS NULL
        AND revenue IS NOT NULL
        AND operating_income IS NOT NULL
    `);
    console.log(`   ✅ Updated ${opMarginUpdate.rowCount} records\n`);

    // 5. Calculate and update EBITDA Ratio
    console.log('5️⃣  Calculating EBITDA Margin...');
    const ebitdaMarginUpdate = await db.query(`
      UPDATE stock_financials
      SET ebitda_ratio = CASE
        WHEN revenue > 0 THEN ROUND((ebitda / revenue), 4)
        ELSE NULL
      END
      WHERE ebitda_ratio IS NULL
        AND revenue IS NOT NULL
        AND ebitda IS NOT NULL
    `);
    console.log(`   ✅ Updated ${ebitdaMarginUpdate.rowCount} records\n`);

    // 6. Calculate and update Gross Profit Ratio
    console.log('6️⃣  Calculating Gross Profit Margin...');
    const gpMarginUpdate = await db.query(`
      UPDATE stock_financials
      SET gross_profit_ratio = CASE
        WHEN revenue > 0 THEN ROUND((gross_profit / revenue), 4)
        ELSE NULL
      END
      WHERE gross_profit_ratio IS NULL
        AND revenue IS NOT NULL
        AND gross_profit IS NOT NULL
    `);
    console.log(`   ✅ Updated ${gpMarginUpdate.rowCount} records\n`);

    // 7. Verify results
    console.log('📊 Verification:\n');

    const verifyKM = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(pb_ratio) as pb_ratio,
        COUNT(debt_to_equity) as debt_to_equity
      FROM stock_key_metrics
    `);
    const km = verifyKM.rows[0];
    console.log(`stock_key_metrics (${km.total} records):`);
    console.log(`  P/B ratio: ${km.pb_ratio} (${(km.pb_ratio / km.total * 100).toFixed(1)}%)`);
    console.log(`  Debt/Equity: ${km.debt_to_equity} (${(km.debt_to_equity / km.total * 100).toFixed(1)}%)`);

    const verifyFin = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(net_income_ratio) as net_margin,
        COUNT(operating_income_ratio) as op_margin,
        COUNT(ebitda_ratio) as ebitda_margin,
        COUNT(gross_profit_ratio) as gp_margin
      FROM stock_financials
    `);
    const fin = verifyFin.rows[0];
    console.log(`\nstock_financials (${fin.total} records):`);
    console.log(`  Net Margin: ${fin.net_margin} (${(fin.net_margin / fin.total * 100).toFixed(1)}%)`);
    console.log(`  Operating Margin: ${fin.op_margin} (${(fin.op_margin / fin.total * 100).toFixed(1)}%)`);
    console.log(`  EBITDA Margin: ${fin.ebitda_margin} (${(fin.ebitda_margin / fin.total * 100).toFixed(1)}%)`);
    console.log(`  Gross Margin: ${fin.gp_margin} (${(fin.gp_margin / fin.total * 100).toFixed(1)}%)`);

    // Sample data
    console.log('\n📊 Sample: RELIANCE.NS\n');
    const sampleResult = await db.query(`
      SELECT
        km.fmp_symbol,
        km.pb_ratio,
        km.debt_to_equity,
        f.net_income_ratio,
        f.operating_income_ratio,
        f.ebitda_ratio,
        f.gross_profit_ratio
      FROM stock_key_metrics km
      LEFT JOIN stock_financials f ON km.fmp_symbol = f.fmp_symbol AND km.period_end = f.period_end
      WHERE km.fmp_symbol = 'RELIANCE.NS'
      ORDER BY km.period_end DESC
      LIMIT 1
    `);

    if (sampleResult.rows.length > 0) {
      const s = sampleResult.rows[0];
      console.log(`P/B Ratio: ${s.pb_ratio}`);
      console.log(`Debt/Equity: ${s.debt_to_equity}`);
      console.log(`Net Margin: ${s.net_income_ratio ? (s.net_income_ratio * 100).toFixed(2) + '%' : 'N/A'}`);
      console.log(`Operating Margin: ${s.operating_income_ratio ? (s.operating_income_ratio * 100).toFixed(2) + '%' : 'N/A'}`);
      console.log(`EBITDA Margin: ${s.ebitda_ratio ? (s.ebitda_ratio * 100).toFixed(2) + '%' : 'N/A'}`);
      console.log(`Gross Margin: ${s.gross_profit_ratio ? (s.gross_profit_ratio * 100).toFixed(2) + '%' : 'N/A'}`);
    }

    console.log('\n✅ All calculated metrics populated!');
    console.log('\n📊 Next step: Recalculate quality scores with updated data\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

populateCalculatedMetrics();
