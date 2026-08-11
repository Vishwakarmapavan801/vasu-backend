const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

/**
 * Execute migration SQL one statement at a time (see run-migration-v14.js
 * for why: PostgreSQL's extended query protocol silently skips trailing
 * statements of a multi-statement string inside an explicit transaction).
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

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return rows.length > 0;
}

async function runMigration() {
  console.log('Running v15 migration (MLS Blog Content schema)...');
  const sqlPath = path.join(__dirname, 'migrate-v15.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    console.error('v15 migration failed: no statements found in SQL file');
    process.exit(1);
  }
  console.log(`  Parsed ${statements.length} statements (executed in file order).`);

  const client = await pool.connect();

  try {
    const baseExists = await columnExists(client, 'blog_posts', 'id');
    if (!baseExists) {
      console.error('v15 migration failed: blog_posts table does not exist.');
      process.exit(1);
    }

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

    const commitResult = await client.query('COMMIT');
    if (commitResult.command !== 'COMMIT') {
      throw new Error('Transaction was rolled back instead of committed.');
    }
    console.log('  COMMIT ok.');

    try {
      await client.query(
        `INSERT INTO schema_audit (migration, action, details)
         VALUES ('v15', 'alter', 'blog_posts: source_type/status/category/city/county/state/neighborhood/listing_key/read_time/published_at/meta_title/meta_description/tags/metrics/author_name/featured/updated_at + indexes')
         ON CONFLICT DO NOTHING`
      );
    } catch (_) {
      console.log('  schema_audit table not found — skipping audit log (non-fatal)');
    }

    const required = ['source_type', 'status', 'category', 'city', 'county', 'state', 'neighborhood', 'listing_key', 'read_time', 'published_at', 'meta_title', 'meta_description', 'tags', 'metrics', 'author_name', 'featured', 'updated_at'];
    const missing = [];
    for (const col of required) {
      const exists = await columnExists(client, 'blog_posts', col);
      if (!exists) missing.push(col);
    }
    if (missing.length > 0) {
      console.error(`v15 migration completed but REQUIRED COLUMNS ARE MISSING: ${missing.join(', ')}`);
      process.exit(1);
    }

    console.log('v15 migration completed successfully. Columns verified: all present.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
      console.log('  ROLLBACK ok.');
    } catch (_) {}
    console.error('v15 migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration().catch(() => process.exit(1));
