import db from './src/db.js';

async function cleanupHelios() {
  try {
    console.log('🔍 Checking Helios portfolio dates...\n');

    // Check what dates exist for Helios
    const datesResult = await db.query(`
      SELECT DISTINCT portfolio_date, COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY portfolio_date
      ORDER BY portfolio_date DESC
    `);

    console.log('Helios portfolio dates:');
    datesResult.rows.forEach(row => {
      console.log(`  ${row.portfolio_date}: ${row.count} records`);
    });

    // Delete all Helios records that are not from January 2026 (2026-01-31)
    console.log('\n🗑️  Deleting old Helios records...');

    const deleteResult = await db.query(`
      DELETE FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      AND portfolio_date NOT IN ('2026-01-31', 'January_2026', '31-Jan-2026', '2026-01')
    `);

    console.log(`✅ Deleted ${deleteResult.rowCount} old records`);

    // Verify remaining data
    const verifyResult = await db.query(`
      SELECT portfolio_date, COUNT(*) as count
      FROM mutualfund_portfolio
      WHERE fund_house = 'Helios'
      GROUP BY portfolio_date
    `);

    console.log('\n📊 Remaining Helios data:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.portfolio_date}: ${row.count} records`);
    });

    const totalResult = await db.query(`
      SELECT COUNT(*) as total FROM mutualfund_portfolio WHERE fund_house = 'Helios'
    `);
    console.log(`\nTotal Helios records: ${totalResult.rows[0].total}`);

    console.log('\n✨ Cleanup completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

cleanupHelios();
