import pg from 'pg';
const { Client } = pg;

const RAILWAY_URL = 'postgresql://postgres:FTurqGaYdypSsGmTLYNYUaOaltMuLeiT@trolley.proxy.rlwy.net:48162/railway';

async function copyDatabase() {
  console.log('🚀 Starting database migration to Railway...\n');

  const local = new Client({
    host: 'localhost',
    database: 'Sankyaan',
    user: 'postgres',
    password: 'Sankyaan',
    port: 5432,
  });

  const railway = new Client({
    connectionString: RAILWAY_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await local.connect();
    await railway.connect();
    console.log('✅ Connected to both databases\n');

    // Get all tables
    const { rows: tables } = await local.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`📋 Found ${tables.length} tables\n`);

    for (const { tablename } of tables) {
      console.log(`\n📦 Migrating: ${tablename}`);

      try {
        // Get row count
        const { rows: [{ count }] } = await local.query(`SELECT COUNT(*) FROM "${tablename}"`);
        console.log(`   Rows: ${parseInt(count).toLocaleString()}`);

        if (count === '0') {
          console.log(`   ⏭️  Skipping empty table`);
          continue;
        }

        // Get all column names and types
        const { rows: columns } = await local.query(`
          SELECT
            column_name,
            udt_name,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [tablename]);

        // Build CREATE TABLE statement
        const columnDefs = columns.map(col => {
          let def = `"${col.column_name}" ${col.udt_name}`;
          if (col.is_nullable === 'NO') def += ' NOT NULL';
          if (col.column_default && !col.column_default.startsWith('nextval')) {
            def += ` DEFAULT ${col.column_default}`;
          }
          return def;
        }).join(', ');

        // Drop and create table on Railway
        await railway.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
        await railway.query(`CREATE TABLE "${tablename}" (${columnDefs})`);
        console.log(`   ✅ Table structure created`);

        // Copy data in batches
        const batchSize = 1000;
        const totalRows = parseInt(count);
        let copied = 0;

        const columnNames = columns.map(c => `"${c.column_name}"`).join(', ');
        const { rows: allData } = await local.query(`SELECT * FROM "${tablename}"`);

        for (let i = 0; i < allData.length; i += batchSize) {
          const batch = allData.slice(i, i + batchSize);

          for (const row of batch) {
            const values = columns.map((_, idx) => `$${idx + 1}`).join(', ');
            const data = columns.map(col => row[col.column_name]);

            await railway.query(
              `INSERT INTO "${tablename}" (${columnNames}) VALUES (${values})`,
              data
            );
            copied++;
          }

          if (copied % 5000 === 0 || copied === totalRows) {
            console.log(`   📈 Progress: ${copied.toLocaleString()} / ${totalRows.toLocaleString()}`);
          }
        }

        console.log(`   ✅ Copied ${copied.toLocaleString()} rows`);

      } catch (err) {
        console.error(`   ❌ Error migrating ${tablename}:`, err.message);
      }
    }

    console.log('\n\n🎉 Migration completed!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  } finally {
    await local.end();
    await railway.end();
  }
}

copyDatabase();
