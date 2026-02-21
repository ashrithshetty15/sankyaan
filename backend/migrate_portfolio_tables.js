/**
 * migrate_portfolio_tables.js
 * Migrates all new portfolio_* tables into mutualfund_portfolio
 * Run: node migrate_portfolio_tables.js
 */

import db from './src/db.js';

const TABLE_TO_FUND_HOUSE = {
  portfolio_360_one:           '360 ONE',
  portfolio_axis:              'Axis',
  portfolio_bajaj_finserv:     'Bajaj Finserv',
  portfolio_bank_of_india:     'Bank of India',
  portfolio_baroda_bnp_paribas:'Baroda BNP Paribas',
  portfolio_canara_robeco:     'Canara Robeco',
  portfolio_edelweiss:         'Edelweiss',
  portfolio_franklin_templeton: 'Franklin Templeton',
  portfolio_groww:             'Groww',
  portfolio_helios:            'Helios',
  portfolio_iti:               'ITI',
  portfolio_kotak_mahindra:    'Kotak Mahindra',
  portfolio_mahindra:          'Mahindra Manulife',
  portfolio_motilal_oswal:     'Motilal Oswal',
  portfolio_nippon_india:      'Nippon India',
  portfolio_old_bridge:        'Old Bridge',
  portfolio_ppfas:             'PPFAS',
  portfolio_quant:             'Quant',
  portfolio_quantum:           'Quantum',
  portfolio_sbi:               'SBI',
  portfolio_samco:             'Samco',
  portfolio_shriram:           'Shriram',
  portfolio_sundaram:          'Sundaram',
  portfolio_tata:              'Tata',
  portfolio_trust:             'Trust',
};

async function migrateTable(tableName, fundHouse) {
  // Fetch only valid holding rows (exclude subtotal/returns rows where pct_to_nav is out of range)
  const src = await db.query(`SELECT * FROM ${tableName} WHERE pct_to_nav BETWEEN -1.5 AND 1.5`);
  if (src.rows.length === 0) {
    console.log(`  ⚠️  ${tableName}: 0 rows — skipping`);
    return 0;
  }

  // Delete existing rows for this fund_house from mutualfund_portfolio (idempotent)
  const del = await db.query(
    `DELETE FROM mutualfund_portfolio WHERE fund_house = $1`,
    [fundHouse]
  );
  if (del.rowCount > 0) {
    console.log(`  🗑  Removed ${del.rowCount} existing rows for "${fundHouse}"`);
  }

  // Insert in batches of 500
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < src.rows.length; i += BATCH) {
    const batch = src.rows.slice(i, i + BATCH);

    // Build multi-row INSERT
    const values = [];
    const placeholders = batch.map((row, idx) => {
      const base = idx * 11;
      // pct_to_nav is stored as decimal (e.g. 0.0483 = 4.83%)
      const percentNav = row.pct_to_nav != null ? parseFloat(row.pct_to_nav) * 100 : null;
      // portfolio_date: date object → ISO string → take first 10 chars
      const portfolioDate = row.portfolio_date
        ? new Date(row.portfolio_date).toISOString().slice(0, 10)
        : null;

      values.push(
        fundHouse,                              // $1  fund_house
        row.scheme_name,                        // $2  fund_name
        row.scheme_name,                        // $3  scheme_name
        portfolioDate,                          // $4  portfolio_date (varchar)
        row.source_file || null,               // $5  source_file
        row.isin || null,                       // $6  isin
        row.instrument_name || null,            // $7  instrument_name
        row.industry_rating || null,            // $8  industry_rating
        row.quantity != null ? Math.round(parseFloat(row.quantity)) : null, // $9 quantity (bigint)
        row.market_value_lakh != null ? parseFloat(row.market_value_lakh) : null, // $10 market_value_lacs
        percentNav,                             // $11 percent_nav
      );

      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11})`;
    });

    await db.query(
      `INSERT INTO mutualfund_portfolio
         (fund_house, fund_name, scheme_name, portfolio_date, source_file,
          isin, instrument_name, industry_rating, quantity, market_value_lacs, percent_nav)
       VALUES ${placeholders.join(',')}`,
      values
    );

    inserted += batch.length;
  }

  return inserted;
}

async function main() {
  console.log('🚀 Migrating portfolio_* tables into mutualfund_portfolio\n');

  const tables = Object.entries(TABLE_TO_FUND_HOUSE);
  let totalInserted = 0;

  for (const [tableName, fundHouse] of tables) {
    console.log(`📂 ${tableName} → "${fundHouse}"`);
    try {
      const count = await migrateTable(tableName, fundHouse);
      console.log(`  ✅ Inserted ${count} rows\n`);
      totalInserted += count;
    } catch (err) {
      console.error(`  ❌ Error for ${tableName}:`, err.message, '\n');
    }
  }

  console.log(`\n🎉 Migration complete. Total rows inserted: ${totalInserted}`);

  // Show updated counts
  const result = await db.query(`SELECT fund_house, COUNT(*) AS rows FROM mutualfund_portfolio GROUP BY fund_house ORDER BY fund_house`);
  console.log('\n📊 Rows per fund house in mutualfund_portfolio:');
  result.rows.forEach(r => console.log(`   ${r.fund_house}: ${r.rows}`));

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
