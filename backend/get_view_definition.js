import db from './src/db.js';

async function getViewDef() {
  try {
    const result = await db.query(`
      SELECT pg_get_viewdef('stock_fundamentals'::regclass, true) as viewdef
    `);

    console.log('stock_fundamentals VIEW definition:\n');
    console.log(result.rows[0].viewdef);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

getViewDef();
