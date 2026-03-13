import db from './src/db.js';

async function checkExtremeAltmanZ() {
  try {
    console.log('📊 Investigating Extreme Altman Z-Scores\n');

    // 1. Find stocks with extreme Z-Scores
    const extremeZ = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        s.sector,
        sqs.altman_z_score,
        sqs.piotroski_score,
        sqs.magic_formula_score
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      WHERE sqs.altman_z_score > 10
      ORDER BY sqs.altman_z_score DESC
      LIMIT 20
    `);

    console.log('Stocks with Altman Z-Score > 10:\n');
    console.log('Symbol'.padEnd(20), 'Company'.padEnd(40), 'Sector'.padEnd(20), 'Z-Score');
    console.log('-'.repeat(120));

    extremeZ.rows.forEach(r => {
      const zScore = r.altman_z_score ? parseFloat(r.altman_z_score).toFixed(2) : 'NULL';
      console.log(
        r.symbol.padEnd(20),
        (r.company_name || 'N/A').substring(0, 38).padEnd(40),
        (r.sector || 'N/A').substring(0, 18).padEnd(20),
        zScore
      );
    });

    console.log('\nTotal stocks with Z > 10:', extremeZ.rowCount);

    // 2. Get detailed balance sheet data for top 3 extreme cases
    if (extremeZ.rows.length > 0) {
      console.log('\n\n📋 Detailed Balance Sheet for Top 3 Extreme Cases:\n');

      for (let i = 0; i < Math.min(3, extremeZ.rows.length); i++) {
        const stock = extremeZ.rows[i];
        console.log(`\n${i+1}. ${stock.symbol} - ${stock.company_name}`);
        console.log(`   Sector: ${stock.sector || 'N/A'}`);
        console.log(`   Altman Z-Score: ${stock.altman_z_score ? parseFloat(stock.altman_z_score).toFixed(2) : 'NULL'}\n`);

        // Get latest balance sheet
        const bs = await db.query(`
          SELECT
            period_end,
            total_assets,
            total_liabilities,
            total_current_assets,
            total_current_liabilities,
            total_stockholders_equity,
            retained_earnings,
            total_debt
          FROM stock_balance_sheet
          WHERE fmp_symbol = $1
          ORDER BY period_end DESC
          LIMIT 1
        `, [stock.symbol]);

        if (bs.rows.length > 0) {
          const b = bs.rows[0];
          console.log('   Balance Sheet (Latest):');
          console.log(`   - Total Assets: ₹${b.total_assets ? (parseFloat(b.total_assets) / 10000000).toFixed(2) : 'NULL'} Cr`);
          console.log(`   - Total Liabilities: ₹${b.total_liabilities ? (parseFloat(b.total_liabilities) / 10000000).toFixed(2) : 'NULL'} Cr`);
          console.log(`   - Stockholders Equity: ₹${b.total_stockholders_equity ? (parseFloat(b.total_stockholders_equity) / 10000000).toFixed(2) : 'NULL'} Cr`);
          console.log(`   - Current Assets: ₹${b.total_current_assets ? (parseFloat(b.total_current_assets) / 10000000).toFixed(2) : 'NULL'} Cr`);
          console.log(`   - Current Liabilities: ₹${b.total_current_liabilities ? (parseFloat(b.total_current_liabilities) / 10000000).toFixed(2) : 'NULL'} Cr`);
          console.log(`   - Retained Earnings: ₹${b.retained_earnings ? (parseFloat(b.retained_earnings) / 10000000).toFixed(2) : 'NULL'} Cr`);

          // Calculate Altman Z components
          const assets = parseFloat(b.total_assets) || 0;
          const liabilities = parseFloat(b.total_liabilities) || 0;
          const equity = parseFloat(b.total_stockholders_equity) || 0;
          const currentAssets = parseFloat(b.total_current_assets) || 0;
          const currentLiabilities = parseFloat(b.total_current_liabilities) || 0;
          const retainedEarnings = parseFloat(b.retained_earnings) || 0;

          const workingCapital = currentAssets - currentLiabilities;

          console.log('\n   Altman Z Ratios:');
          if (assets > 0) {
            console.log(`   - X1 (Working Capital / Assets): ${(workingCapital / assets).toFixed(4)}`);
            console.log(`   - X2 (Retained Earnings / Assets): ${(retainedEarnings / assets).toFixed(4)}`);
          } else {
            console.log(`   - Assets is ZERO or NULL - This causes division errors!`);
          }
          if (liabilities > 0) {
            console.log(`   - X4 (Equity / Liabilities): ${(equity / liabilities).toFixed(4)}`);
          } else {
            console.log(`   - Liabilities is ZERO or NULL - This causes INFINITE X4!`);
          }
        } else {
          console.log('   ⚠️  No balance sheet data available');
        }

        // Get income statement for X3 (using operating_income as proxy for EBIT)
        const income = await db.query(`
          SELECT operating_income
          FROM stock_financials
          WHERE fmp_symbol = $1
          ORDER BY period_end DESC
          LIMIT 1
        `, [stock.symbol]);

        if (income.rows.length > 0 && bs.rows.length > 0) {
          const ebit = parseFloat(income.rows[0].operating_income) || 0;
          const assets = parseFloat(bs.rows[0].total_assets) || 0;
          if (assets > 0) {
            console.log(`   - X3 (Operating Income / Assets): ${(ebit / assets).toFixed(4)}`);
          }
        }
      }
    }

    // 3. Check sector distribution
    console.log('\n\n📊 Sector Distribution of Extreme Z-Scores (Z > 10):\n');
    const sectorDist = await db.query(`
      SELECT
        s.sector,
        COUNT(*) as count,
        AVG(sqs.altman_z_score) as avg_z,
        MAX(sqs.altman_z_score) as max_z
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      WHERE sqs.altman_z_score > 10
      GROUP BY s.sector
      ORDER BY count DESC
    `);

    sectorDist.rows.forEach(r => {
      console.log(`${(r.sector || 'Unknown').padEnd(30)} Count: ${String(r.count).padStart(3)}  Avg: ${parseFloat(r.avg_z).toFixed(2).padStart(8)}  Max: ${parseFloat(r.max_z).toFixed(2)}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkExtremeAltmanZ();
