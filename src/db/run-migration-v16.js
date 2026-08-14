const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

/**
 * Execute v16 migration (Overpass result cache table).
 * Uses the same one-statement-at-a-time approach as v15.
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
  return (cleaned + '\n')
    .split(/;\s*\r?\n/)
    .map((s) => s.trim().replace(/;+\s*$/, ''))
    .filter((s) => s.length > 0);
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return rows.length > 0;
}

async function runMigration() {
  console.log('Running v16 migration (Overpass result cache schema)...');
  const sqlPath = path.join(__dirname, 'migrate-v16.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    console.error('v16 migration failed: no statements found in SQL file');
    process.exit(1);
  }
  console.log(`  Parsed ${statements.length} statements (executed in file order).`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      try {
        await client.query(statements[i]);
      } catch (err) {
        console.error(`  Statement ${i + 1}/${statements.length} failed: ${err.message}`);
        console.error(`    SQL: ${statements[i].slice(0, 140)}`);
        throw err;
      }
    }

    await client.query('COMMIT');
    console.log('  COMMIT ok.');

    try {
      await client.query(
        `INSERT INTO schema_audit (migration, action, details)
         VALUES ('v16', 'create', 'overpass_cache: query_hash/query/elements/unavailable/fetched_at/accessed_at + indexes')
         ON CONFLICT DO NOTHING`
      );
    } catch (_) {
      console.log('  schema_audit table not found — skipping audit log (non-fatal)');
    }

    if (!(await tableExists(client, 'overpass_cache'))) {
      console.error('v16 migration failed: overpass_cache table does not exist after run.');
      process.exit(1);
    }

    console.log('v16 migration completed successfully.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
      console.log('  ROLLBACK ok.');
    } catch (_) {}
    console.error('v16 migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration().catch(() => process.exit(1));
