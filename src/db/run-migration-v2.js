const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const {
  DATABASE_URL,
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_NAME = 'vasu',
  DB_USER = 'postgres',
  DB_PASSWORD = 'admin',
  NODE_ENV = 'development',
} = process.env;

const IS_RENDER = process.env.RENDER === 'true';
const useSSL = IS_RENDER || NODE_ENV === 'production';

let pool;
if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : false });
} else {
  pool = new Pool({
    host: DB_HOST,
    port: parseInt(DB_PORT, 10) || 5432,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });
}

async function runMigrationV2() {
  console.log('\n  Running v2 Migration (JotForm Sync Queue)...\n');

  const sqlPath = path.join(__dirname, 'migrate-v2.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const lines = sql.split('\n');
  const statements = [];
  let buf = [];
  let inDollar = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollar) continue;
    const dollarCount = (trimmed.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 1) inDollar = !inDollar;
    buf.push(line);
    if (!inDollar && trimmed.endsWith(';')) {
      statements.push(buf.join('\n').trim());
      buf = [];
    }
  }
  const remaining = buf.join('\n').trim();
  if (remaining) statements.push(remaining);

  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      await pool.query(stmt);
    } catch (err) {
      console.error(`  ✗ Statement error: ${err.message.slice(0, 120)}`);
    }
  }

  console.log('  ✓ jotform_sync_queue table ready');

  const { rows } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'jotform_sync_queue'
     ORDER BY ordinal_position`
  );
  console.log(`    Columns: ${rows.length}`);
  rows.forEach(r => console.log(`      ${r.column_name} (${r.data_type})`));

  await pool.end();
  console.log('\n  ✓ v2 migration complete\n');
  process.exit(0);
}

runMigrationV2().catch(err => {
  console.error('\n  ✗ Migration failed:', err.message);
  process.exit(1);
});
