import db from './src/db.js';
import fs from 'fs/promises';

async function linkMFHoldingsToStocks() {
  try {
    console.log('🔗 Linking Mutual Fund Holdings to Stocks via ISIN\n');

    // 1. Add stock_id column if it doesn't exist
    console.log('📝 Step 1: Adding stock_id column...');
    await db.query(`
      ALTER TABLE mutualfund_portfolio
      ADD COLUMN IF NOT EXISTS stock_id INTEGER REFERENCES stocks(id)
    `);
    console.log('✅ Column added\n');

    // 2. Create indexes
    console.log('📝 Step 2: Creating indexes...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mf_portfolio_stock_id ON mutualfund_portfolio(stock_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mf_portfolio_isin ON mutualfund_portfolio(isin)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_stocks_isin ON stocks(isin)
    `);
    console.log('✅ Indexes created\n');

    // 3. Check before update
    const before = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN stock_id IS NOT NULL THEN 1 END) as linked_before
      FROM mutualfund_portfolio
    `);
    console.log(`📊 Before Update: ${before.rows[0].linked_before}/${before.rows[0].total} linked\n`);

    // 4. Update stock_id by matching ISIN
    console.log('🔄 Step 3: Linking holdings to stocks via ISIN...');
    const updateResult = await db.query(`
      UPDATE mutualfund_portfolio mfp
      SET stock_id = s.id
      FROM stocks s
      WHERE mfp.isin = s.isin
        AND mfp.isin IS NOT NULL
        AND mfp.isin != ''
        AND s.isin IS NOT NULL
        AND s.isin != ''
        AND mfp.stock_id IS NULL
    `);
    console.log(`✅ Updated ${updateResult.rowCount} holdings\n`);

    // 5. Check results
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_holdings,
        COUNT(DISTINCT instrument_name) as unique_instruments,
        COUNT(CASE WHEN stock_id IS NOT NULL THEN 1 END) as linked,
        COUNT(CASE WHEN stock_id IS NULL THEN 1 END) as not_linked,
        COUNT(DISTINCT stock_id) as unique_stocks
      FROM mutualfund_portfolio
    `);

    const s = stats.rows[0];
    console.log('📊 Final Results:');
    console.log(`   Total holdings: ${s.total_holdings}`);
    console.log(`   Linked to stocks: ${s.linked} (${((s.linked / s.total_holdings) * 100).toFixed(1)}%)`);
    console.log(`   Not linked: ${s.not_linked} (${((s.not_linked / s.total_holdings) * 100).toFixed(1)}%)`);
    console.log(`   Unique stocks referenced: ${s.unique_stocks}\n`);

    // 6. Sample linked holdings
    const samples = await db.query(`
      SELECT
        mfp.instrument_name,
        mfp.isin,
        s.symbol,
        s.company_name,
        COUNT(*) as holding_count
      FROM mutualfund_portfolio mfp
      JOIN stocks s ON s.id = mfp.stock_id
      WHERE mfp.stock_id IS NOT NULL
      GROUP BY mfp.instrument_name, mfp.isin, s.symbol, s.company_name
      ORDER BY holding_count DESC
      LIMIT 15
    `);

    console.log('📋 Top Linked Holdings (by frequency):');
    console.log('Instrument Name'.padEnd(40), 'ISIN'.padEnd(15), 'Symbol'.padEnd(20), 'Holdings');
    console.log('-'.repeat(100));
    samples.rows.forEach(r => {
      console.log(
        r.instrument_name.substring(0, 38).padEnd(40),
        r.isin.padEnd(15),
        r.symbol.padEnd(20),
        String(r.holding_count).padStart(8)
      );
    });

    // 7. Check unlinked holdings
    console.log('\n📊 Unlinked Holdings Analysis:');
    const unlinkedByReason = await db.query(`
      SELECT
        CASE
          WHEN isin IS NULL OR isin = '' THEN 'No ISIN'
          WHEN isin NOT IN (SELECT isin FROM stocks WHERE isin IS NOT NULL) THEN 'ISIN not in stocks table'
          ELSE 'Other'
        END as reason,
        COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE stock_id IS NULL
      GROUP BY 1
      ORDER BY count DESC
    `);

    unlinkedByReason.rows.forEach(r => {
      console.log(`   ${r.reason}: ${r.count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

linkMFHoldingsToStocks();
