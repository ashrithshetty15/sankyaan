import pg from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);
const { Client } = pg;

const RAILWAY_URL = 'postgresql://postgres:FTurqGaYdypSsGmTLYNYUaOaltMuLeiT@trolley.proxy.rlwy.net:48162/railway';

async function migrate() {
  console.log('🚀 Starting simplified database migration...\n');

  // Create a temporary SQL dump file
  const dumpFile = 'sankyaan_dump.sql';

  console.log('📦 Step 1: Exporting local database schema and data...');

  // Use pg_dump if available, otherwise use Node.js approach
  const localClient = new Client({
    host: 'localhost',
    database: 'Sankyaan',
    user: 'postgres',
    password: 'Sankyaan',
    port: 5432,
  });

  const railwayClient = new Client({
    connectionString: RAILWAY_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await localClient.connect();
    await railwayClient.connect();

    console.log('✅ Connected to both databases\n');

    // Get all tables
    const tablesResult = await localClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(r => r.table_name);
    console.log(`📋 Found ${tables.length} tables to migrate\n`);

    let sqlDump = '';

    // For each table, generate CREATE TABLE and INSERT statements
    for (const tableName of tables) {
      console.log(`📦 Processing table: ${tableName}`);

      // Get column information
      const columnsResult = await localClient.query(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      // Build CREATE TABLE statement
      const columns = columnsResult.rows.map(col => {
        let def = `"${col.column_name}" ${col.data_type}`;

        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }

        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }

        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }

        return def;
      }).join(',\n  ');

      sqlDump += `\n-- Table: ${tableName}\n`;
      sqlDump += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`;
      sqlDump += `CREATE TABLE "${tableName}" (\n  ${columns}\n);\n\n`;

      // Get data
      const dataResult = await localClient.query(`SELECT * FROM "${tableName}"`);
      const rowCount = dataResult.rows.length;

      if (rowCount > 0) {
        console.log(`  📊 Copying ${rowCount.toLocaleString()} rows...`);

        const columnNames = columnsResult.rows.map(c => `"${c.column_name}"`).join(', ');

        for (const row of dataResult.rows) {
          const values = columnsResult.rows.map(col => {
            const val = row[col.column_name];
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return val;
          }).join(', ');

          sqlDump += `INSERT INTO "${tableName}" (${columnNames}) VALUES (${values});\n`;
        }

        sqlDump += '\n';
        console.log(`  ✅ Exported ${rowCount.toLocaleString()} rows\n`);
      } else {
        console.log(`  ℹ️  Table is empty\n`);
      }
    }

    // Write to file
    console.log(`\n💾 Writing SQL dump to ${dumpFile}...`);
    fs.writeFileSync(dumpFile, sqlDump, 'utf8');
    console.log(`✅ SQL dump created (${(sqlDump.length / 1024 / 1024).toFixed(2)} MB)\n`);

    // Import to Railway
    console.log('📥 Importing to Railway database...');
    await railwayClient.query(sqlDump);

    console.log('\n🎉 Migration completed successfully!\n');
    console.log(`✅ All ${tables.length} tables migrated to Railway`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    throw error;
  } finally {
    await localClient.end();
    await railwayClient.end();
  }
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
