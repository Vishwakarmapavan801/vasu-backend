const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

/**
 * Split a migration SQL file into individual statements.
 *
 * PostgreSQL's extended/simple query protocol silently skips statements
 * after a multi-statement string when run inside an explicit transaction,
 * so every migration must be executed one statement at a time in the order
 * the file defines them. That preserves CREATE TABLE before its indexes,
 * and ALTER before/after tables exactly as written.
 */

/**
 * Remove SQL `--` line comments while ignoring comment markers that appear
 * inside single- or double-quoted string literals (e.g. a default value
 * containing "--"). Block comments are not expected in migration files.
 */
function stripComments(sql) {
  let out = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      out += ch;
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      continue;
    }
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += ch;
  }

  return out;
}

function splitStatements(sql) {
  const cleaned = stripComments(sql);
  // Ensure the final statement is captured even without a trailing newline.
  return (cleaned + '\n')
    .split(/;\s*\r?\n/)
    .map((s) => s.trim().replace(/;+\s*$/, ''))
    .filter((s) => s.length > 0);
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return rows.length > 0;
}

async function runMigration() {
  console.log('Running v14 migration (Admin Panel schema)...');
  const sqlPath = path.join(__dirname, 'migrate-v14.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    console.error('v14 migration failed: no statements found in SQL file');
    process.exit(1);
  }
  console.log(`  Parsed ${statements.length} statements (executed in file order).`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await client.query(stmt);
      } catch (err) {
        console.error(`  Statement ${i + 1}/${statements.length} failed: ${err.message}`);
        console.error(`    SQL: ${stmt.slice(0, 140)}`);
        throw err;
      }
    }

    // COMMIT inside an aborted transaction succeeds without an error but is
    // treated as a ROLLBACK — fail loudly instead of reporting a false success.
    const commitResult = await client.query('COMMIT');
    if (commitResult.command !== 'COMMIT') {
      throw new Error('Transaction was rolled back instead of committed.');
    }
    console.log('  COMMIT ok.');

    // Record the migration in schema_audit when that table exists (v11+).
    // Runs AFTER commit so a missing schema_audit table can never abort the
    // transaction and silently discard the whole migration.
    try {
      await client.query(
        `INSERT INTO schema_audit (migration, action, details)
         VALUES ('v14', 'create', 'admin panel schema: users.role/status, admin_audit_log, admin_settings, listing_admin_meta, mls_sync_status, mls_sync_errors')
         ON CONFLICT DO NOTHING`
      );
    } catch (_) {
      console.log('  ⚠ schema_audit table not found — skipping audit log (non-fatal)');
    }

    // Post-commit verification — never claim success if tables are missing.
    const required = [
      'admin_audit_log',
      'admin_settings',
      'listing_admin_meta',
      'mls_sync_status',
      'mls_sync_errors',
    ];
    const missing = [];
    for (const table of required) {
      const exists = await tableExists(client, table);
      if (!exists) missing.push(table);
    }
    if (missing.length > 0) {
      console.error(`v14 migration completed but REQUIRED TABLES ARE MISSING: ${missing.join(', ')}`);
      process.exit(1);
    }

    console.log(`v14 migration completed successfully. Tables verified: ${required.join(', ')}`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
      console.log('  ROLLBACK ok.');
    } catch (_) {}
    console.error('v14 migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration().catch(() => process.exit(1));
