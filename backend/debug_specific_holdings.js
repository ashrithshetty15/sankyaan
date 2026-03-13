import db from './src/db.js';

async function debugSpecificHoldings() {
  try {
    console.log('🔍 Debugging Specific Holdings Linkage\n');
    console.log('═'.repeat(80) + '\n');

    const fundName = '360 ONE ELSS Tax Saver Nifty 50 Index Fund';

    // 1. Check all holdings for this fund
    console.log(`📊 All Holdings for: ${fundName}\n`);

    const allHoldings = await db.query(`
      SELECT
        mp.instrument_name,
        mp.isin,
        mp.percent_nav,
        mp.stock_id,
        s.symbol,
        s.company_name,
        s.isin as stock_isin
      FROM mutualfund_portfolio mp
      LEFT JOIN stocks s ON s.id = mp.stock_id
      WHERE mp.fund_name = $1
      ORDER BY mp.percent_nav DESC NULLS LAST
      LIMIT 20
    `, [fundName]);

    console.log('Instrument Name'.padEnd(40), 'MF ISIN'.padEnd(15), '%NAV', 'stock_id', 'Symbol'.padEnd(20), 'Linked?');
    console.log('-'.repeat(120));

    allHoldings.rows.forEach(r => {
      const linked = r.stock_id ? '✓' : '✗';
      const symbol = r.symbol || '-';
      console.log(
        r.instrument_name.substring(0, 38).padEnd(40),
        (r.isin || 'NULL').substring(0, 13).padEnd(15),
        String(r.percent_nav || '-').padStart(5),
        String(r.stock_id || 'NULL').padStart(8),
        symbol.padEnd(20),
        linked
      );
    });

    // 2. Specifically check L&T and Axis Bank holdings
    console.log('\n🔍 Detailed Check for L&T and Axis Bank:\n');

    const specificHoldings = await db.query(`
      SELECT
        mp.instrument_name,
        mp.isin as mf_isin,
        mp.stock_id,
        s.symbol,
        s.isin as stock_isin,
        s.company_name
      FROM mutualfund_portfolio mp
      LEFT JOIN stocks s ON s.id = mp.stock_id
      WHERE mp.fund_name = $1
        AND (
          mp.instrument_name ILIKE '%Larsen%Toubro%'
          OR mp.instrument_name ILIKE '%Axis Bank%'
        )
    `, [fundName]);

    specificHoldings.rows.forEach(r => {
      console.log(`Holding: ${r.instrument_name}`);
      console.log(`  MF ISIN: ${r.mf_isin || 'NULL'}`);
      console.log(`  stock_id: ${r.stock_id || 'NULL'}`);
      console.log(`  Stock Symbol: ${r.symbol || 'NULL'}`);
      console.log(`  Stock ISIN: ${r.stock_isin || 'NULL'}`);
      console.log(`  Stock Name: ${r.company_name || 'NULL'}\n`);
    });

    // 3. Check if L&T and Axis Bank exist in stocks table with ISIN
    console.log('🔍 L&T and Axis Bank in Stocks Table:\n');

    const ltStock = await db.query(`
      SELECT symbol, company_name, isin
      FROM stocks
      WHERE company_name ILIKE '%LARSEN%TOUBRO%'
      LIMIT 5
    `);

    console.log('L&T stocks:');
    ltStock.rows.forEach(r => {
      console.log(`  ${r.symbol.padEnd(20)} ${r.company_name.padEnd(40)} ISIN: ${r.isin || 'NULL'}`);
    });

    const axisStock = await db.query(`
      SELECT symbol, company_name, isin
      FROM stocks
      WHERE company_name ILIKE '%AXIS%BANK%'
      LIMIT 5
    `);

    console.log('\nAxis Bank stocks:');
    axisStock.rows.forEach(r => {
      console.log(`  ${r.symbol.padEnd(20)} ${r.company_name.padEnd(40)} ISIN: ${r.isin || 'NULL'}`);
    });

    // 4. Check if there are any MF holdings with these ISINs
    console.log('\n🔍 Checking MF Holdings ISINs:\n');

    const ltIsin = ltStock.rows.length > 0 ? ltStock.rows[0].isin : null;
    const axisIsin = axisStock.rows.length > 0 ? axisStock.rows[0].isin : null;

    if (ltIsin) {
      const ltMfHoldings = await db.query(`
        SELECT COUNT(*) as count, COUNT(DISTINCT fund_name) as funds
        FROM mutualfund_portfolio
        WHERE isin = $1
      `, [ltIsin]);
      console.log(`L&T (ISIN ${ltIsin}): ${ltMfHoldings.rows[0].count} holdings across ${ltMfHoldings.rows[0].funds} funds`);
    }

    if (axisIsin) {
      const axisMfHoldings = await db.query(`
        SELECT COUNT(*) as count, COUNT(DISTINCT fund_name) as funds
        FROM mutualfund_portfolio
        WHERE isin = $1
      `, [axisIsin]);
      console.log(`Axis Bank (ISIN ${axisIsin}): ${axisMfHoldings.rows[0].count} holdings across ${axisMfHoldings.rows[0].funds} funds`);
    }

    // 5. Check for ISIN mismatches
    console.log('\n⚠️  Checking for ISIN Mismatches:\n');

    const mismatch = await db.query(`
      SELECT
        mp.instrument_name,
        mp.isin as mf_isin,
        mp.fund_name
      FROM mutualfund_portfolio mp
      WHERE mp.fund_name = $1
        AND mp.stock_id IS NULL
        AND mp.isin IS NOT NULL
        AND mp.isin != ''
        AND (
          mp.instrument_name ILIKE '%Larsen%Toubro%'
          OR mp.instrument_name ILIKE '%Axis Bank%'
        )
    `, [fundName]);

    if (mismatch.rows.length > 0) {
      console.log('Unlinked holdings with ISIN:');
      mismatch.rows.forEach(r => {
        console.log(`  ${r.instrument_name} - ISIN: ${r.mf_isin}`);

        // Check if this ISIN exists in stocks table
        db.query(`
          SELECT symbol, company_name FROM stocks WHERE isin = $1
        `, [r.mf_isin]).then(stockResult => {
          if (stockResult.rows.length > 0) {
            console.log(`    ✓ ISIN found in stocks: ${stockResult.rows[0].symbol} - ${stockResult.rows[0].company_name}`);
          } else {
            console.log(`    ✗ ISIN NOT found in stocks table`);
          }
        });
      });
    } else {
      console.log('No ISIN mismatches found for these holdings');
    }

    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugSpecificHoldings();
