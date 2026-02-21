import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'Sankyaan',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Sankyaan',
  port: process.env.DB_PORT || 5432,
});

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected at:', result.rows[0].now);

    // Check if hdfc_portfolio table exists
    console.log('\n📋 Checking table structure...');
    const tableInfo = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'hdfc_portfolio'
      ORDER BY ordinal_position
    `);
    
    if (tableInfo.rows.length === 0) {
      console.log('❌ Table hdfc_portfolio does not exist!');
      return;
    }

    console.log('✅ Table hdfc_portfolio columns:');
    tableInfo.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    // Count rows
    console.log('\n📊 Checking data...');
    const countResult = await pool.query('SELECT COUNT(*) as count FROM hdfc_portfolio');
    console.log(`✅ Total rows in hdfc_portfolio: ${countResult.rows[0].count}`);

    // Get distinct funds
    console.log('\n🎯 Distinct funds:');
    const fundsResult = await pool.query('SELECT DISTINCT fund_name FROM hdfc_portfolio ORDER BY fund_name LIMIT 10');
    console.log(`✅ Found ${fundsResult.rows.length} unique funds (showing first 10):`);
    fundsResult.rows.forEach(row => console.log(`   - ${row.fund_name}`));

    // Test the query we use
    console.log('\n🧪 Testing getTickersWithFunds query...');
    const testQuery = await pool.query(`
      SELECT DISTINCT fund_name, scheme_name
      FROM hdfc_portfolio
      ORDER BY fund_name ASC, scheme_name ASC
      LIMIT 5
    `);
    console.log(`✅ Query returned ${testQuery.rows.length} rows (limited to 5)`);
    console.log(JSON.stringify(testQuery.rows, null, 2));

    // Test search by fund name
    if (testQuery.rows.length > 0) {
      const fundName = testQuery.rows[0].fund_name;
      console.log(`\n🧪 Testing search for fund: ${fundName}`);
      const searchResult = await pool.query(`
        SELECT 
          fund_name,
          scheme_name,
          instrument_name,
          quantity,
          market_value_lacs,
          percent_nav,
          portfolio_date
        FROM hdfc_portfolio
        WHERE fund_name = $1
        LIMIT 5
      `, [fundName]);
      console.log(`✅ Found ${searchResult.rows.length} holdings for this fund (showing first 5):`);
      console.log(JSON.stringify(searchResult.rows, null, 2));
    }

    await pool.end();
    console.log('\n✨ Test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testConnection();
