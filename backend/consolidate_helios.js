import db from './src/db.js';

async function consolidateHelios() {
  try {
    console.log('🔄 Consolidating Helios holdings by instrument...\n');

    // First, let's see the current state
    const beforeResult = await db.query(`
      SELECT fund_name, COUNT(*) as holdings, SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY fund_name
      ORDER BY fund_name
    `);

    console.log('Before consolidation:');
    beforeResult.rows.forEach(row => {
      console.log(`  ${row.fund_name}: ${row.holdings} holdings, ${parseFloat(row.total_pct).toFixed(2)}%`);
    });

    // Create a temporary table with consolidated data
    console.log('\n📊 Creating consolidated data...');

    await db.query(`
      CREATE TEMP TABLE helios_consolidated AS
      SELECT
        fund_house,
        fund_name,
        scheme_name,
        portfolio_date,
        MAX(source_file) as source_file,
        instrument_name,
        MAX(industry_rating) as industry_rating,
        SUM(CAST(quantity AS BIGINT)) as quantity,
        SUM(CAST(market_value_lacs AS DECIMAL)) as market_value_lacs,
        SUM(CAST(percent_nav AS DECIMAL)) as percent_nav,
        MAX(pe_ratio) as pe_ratio
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY fund_house, fund_name, scheme_name, portfolio_date, instrument_name
    `);

    // Delete old Helios data
    console.log('🗑️  Deleting old Helios data...');
    const deleteResult = await db.query(`
      DELETE FROM mutualfund_portfolio WHERE fund_house = 'Helios'
    `);
    console.log(`   Deleted ${deleteResult.rowCount} records`);

    // Insert consolidated data
    console.log('✅ Inserting consolidated data...');
    const insertResult = await db.query(`
      INSERT INTO mutualfund_portfolio (
        fund_house, fund_name, scheme_name, portfolio_date, source_file,
        instrument_name, industry_rating, quantity, market_value_lacs,
        percent_nav, pe_ratio
      )
      SELECT
        fund_house, fund_name, scheme_name, portfolio_date, source_file,
        instrument_name, industry_rating, quantity, market_value_lacs,
        percent_nav, pe_ratio
      FROM helios_consolidated
    `);
    console.log(`   Inserted ${insertResult.rowCount} consolidated records`);

    // Verify the result
    const afterResult = await db.query(`
      SELECT fund_name, COUNT(*) as holdings, SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY fund_name
      ORDER BY fund_name
    `);

    console.log('\nAfter consolidation:');
    afterResult.rows.forEach(row => {
      console.log(`  ${row.fund_name}: ${row.holdings} holdings, ${parseFloat(row.total_pct).toFixed(2)}%`);
    });

    console.log('\n✨ Consolidation complete!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

consolidateHelios();
