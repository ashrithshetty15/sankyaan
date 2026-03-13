import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Sankyaan',
  password: 'Sankyaan',
  port: 5432,
});

async function checkStocks() {
  try {
    const result = await pool.query('SELECT COUNT(DISTINCT instrument_name) as unique_stocks FROM mutualfund_portfolio');
    console.log('Unique stocks in fund holdings:', result.rows[0].unique_stocks);

    const stocks = await pool.query('SELECT DISTINCT instrument_name FROM mutualfund_portfolio ORDER BY instrument_name LIMIT 30');
    console.log('\nSample of stocks in holdings:');
    stocks.rows.forEach(row => console.log('-', row.instrument_name));

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkStocks();
