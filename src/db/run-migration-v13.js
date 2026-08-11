const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  console.log('Running v13 migration...');
  const sqlPath = path.join(__dirname, 'migrate-v13.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(sql);

    // Log migration if the audit table exists (it may not in older databases)
    try {
      await client.query(
        `INSERT INTO schema_audit (migration, action, details)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        ['v13', 'google_oauth', JSON.stringify({
          migration: 'v13',
          columns: ['users.google_id'],
          constraints: ['users.password_hash DROP NOT NULL'],
        })]
      );
    } catch (_) {
      console.log('  ⚠ schema_audit table not found — skipping audit log (non-fatal)');
    }

    await client.query('COMMIT');
    console.log('v13 migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('v13 migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration().catch(() => process.exit(1));
