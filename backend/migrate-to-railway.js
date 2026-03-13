import pg from 'pg';
const { Pool } = pg;

// Local database connection
const localPool = new Pool({
  host: 'localhost',
  database: 'Sankyaan',
  user: 'postgres',
  password: 'Sankyaan',
  port: 5432,
});

// Railway database connection
const railwayPool = new Pool({
  connectionString: 'postgresql://postgres:FTurqGaYdypSsGmTLYNYUaOaltMuLeiT@trolley.proxy.rlwy.net:48162/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrateTables() {
  try {
    console.log('🚀 Starting database migration from local to Railway...\n');

    // Get list of tables from local database
    const tablesResult = await localPool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`📋 Found ${tables.length} tables to migrate\n`);

    for (const tableName of tables) {
      console.log(`📦 Migrating table: ${tableName}`);

      // Get CREATE TABLE statement from local database
      const createTableResult = await localPool.query(`
        SELECT
          'CREATE TABLE IF NOT EXISTS ' || quote_ident(tablename) || ' (' ||
          string_agg(
            quote_ident(attname) || ' ' ||
            pg_catalog.format_type(atttypid, atttypmod) ||
            CASE
              WHEN attnotnull THEN ' NOT NULL'
              ELSE ''
            END ||
            CASE
              WHEN atthasdef THEN ' DEFAULT ' || pg_get_expr(adbin, adrelid)
              ELSE ''
            END,
            ', '
          ) || ')' as create_statement
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
        WHERE c.relname = $1
          AND n.nspname = 'public'
          AND a.attnum > 0
          AND NOT a.attisdropped
        GROUP BY tablename
      `, [tableName]);

      if (createTableResult.rows.length === 0) {
        console.log(`  ⚠️  Skipping ${tableName} - could not get schema`);
        continue;
      }

      const createStatement = createTableResult.rows[0].create_statement;

      // Create table in Railway (DROP first to avoid conflicts)
      await railwayPool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      await railwayPool.query(createStatement);
      console.log(`  ✅ Created table structure`);

      // Copy data
      const countResult = await localPool.query(`SELECT COUNT(*) FROM ${tableName}`);
      const rowCount = parseInt(countResult.rows[0].count);

      if (rowCount === 0) {
        console.log(`  ℹ️  Table is empty, skipping data copy\n`);
        continue;
      }

      console.log(`  📊 Copying ${rowCount.toLocaleString()} rows...`);

      // Get all data from local table
      const dataResult = await localPool.query(`SELECT * FROM ${tableName}`);

      if (dataResult.rows.length > 0) {
        // Get column names
        const columns = Object.keys(dataResult.rows[0]);
        const columnList = columns.map(c => `"${c}"`).join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        // Insert data in batches
        const batchSize = 100;
        let inserted = 0;

        for (let i = 0; i < dataResult.rows.length; i += batchSize) {
          const batch = dataResult.rows.slice(i, i + batchSize);

          for (const row of batch) {
            const values = columns.map(col => row[col]);
            await railwayPool.query(
              `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
              values
            );
            inserted++;
          }

          if (inserted % 500 === 0) {
            console.log(`  📈 Progress: ${inserted.toLocaleString()} / ${rowCount.toLocaleString()} rows`);
          }
        }

        console.log(`  ✅ Copied ${inserted.toLocaleString()} rows\n`);
      }
    }

    // Recreate sequences and indexes
    console.log('\n🔧 Recreating sequences and indexes...');

    // Get sequences
    const sequencesResult = await localPool.query(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
    `);

    for (const seq of sequencesResult.rows) {
      const seqName = seq.sequence_name;
      const seqValue = await localPool.query(`SELECT last_value FROM ${seqName}`);

      try {
        await railwayPool.query(`DROP SEQUENCE IF EXISTS ${seqName} CASCADE`);
        await railwayPool.query(`CREATE SEQUENCE ${seqName} START WITH ${seqValue.rows[0].last_value}`);
        console.log(`  ✅ Created sequence: ${seqName}`);
      } catch (err) {
        console.log(`  ⚠️  Could not create sequence ${seqName}: ${err.message}`);
      }
    }

    // Get indexes
    const indexesResult = await localPool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
    `);

    for (const idx of indexesResult.rows) {
      try {
        await railwayPool.query(`DROP INDEX IF EXISTS ${idx.indexname}`);
        await railwayPool.query(idx.indexdef);
        console.log(`  ✅ Created index: ${idx.indexname}`);
      } catch (err) {
        console.log(`  ⚠️  Could not create index ${idx.indexname}: ${err.message}`);
      }
    }

    console.log('\n🎉 Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await localPool.end();
    await railwayPool.end();
  }
}

// Run migration
migrateTables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
