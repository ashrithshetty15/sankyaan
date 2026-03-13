import db from './src/db.js';

async function analyzeDuplicates() {
  try {
    const fundName = 'Helios Balanced Advantage Fund';

    console.log(`🔍 Analyzing duplicates for: ${fundName}\n`);

    // Check for duplicate instruments
    const duplicatesResult = await db.query(`
      SELECT instrument_name, COUNT(*) as count,
             STRING_AGG(DISTINCT portfolio_date, ', ') as dates,
             STRING_AGG(percent_nav::text, ', ') as percentages
      FROM mutualfund_portfolio
      WHERE fund_name = $1
      GROUP BY instrument_name
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `, [fundName]);

    if (duplicatesResult.rows.length > 0) {
      console.log('Duplicate instruments found:');
      duplicatesResult.rows.forEach(row => {
        console.log(`  ${row.instrument_name}: ${row.count} entries`);
        console.log(`    Dates: ${row.dates}`);
        console.log(`    Percentages: ${row.percentages}\n`);
      });
    } else {
      console.log('No duplicate instruments found.');
    }

    // Check all distinct portfolio dates for this fund across the entire table (even deleted ones)
    const allDatesResult = await db.query(`
      SELECT COUNT(*) as total_count,
             COUNT(DISTINCT portfolio_date) as unique_dates,
             STRING_AGG(DISTINCT portfolio_date, ', ' ORDER BY portfolio_date DESC) as all_dates
      FROM mutualfund_portfolio
      WHERE fund_name = $1
    `, [fundName]);

    console.log('\nAll data for this fund:');
    console.log(`  Total records: ${allDatesResult.rows[0].total_count}`);
    console.log(`  Unique dates: ${allDatesResult.rows[0].unique_dates}`);
    console.log(`  Dates: ${allDatesResult.rows[0].all_dates}`);

    // Check if there are different instrument types
    const typesResult = await db.query(`
      SELECT
        CASE
          WHEN instrument_name LIKE '%Govt%' OR instrument_name LIKE '%Treasury%' THEN 'Government Securities'
          WHEN instrument_name LIKE '%Ltd%' OR instrument_name LIKE '%Limited%' THEN 'Equity'
          WHEN instrument_name LIKE '%Call%' OR instrument_name LIKE '%Put%' THEN 'Derivatives'
          ELSE 'Other'
        END as instrument_type,
        COUNT(*) as count,
        SUM(CAST(percent_nav AS DECIMAL)) as total_pct
      FROM mutualfund_portfolio
      WHERE fund_name = $1
      GROUP BY instrument_type
    `, [fundName]);

    console.log('\nBreakdown by instrument type:');
    typesResult.rows.forEach(row => {
      console.log(`  ${row.instrument_type}: ${row.count} holdings, ${parseFloat(row.total_pct).toFixed(2)}%`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

analyzeDuplicates();
