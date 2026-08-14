const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

/**
 * Execute v17 migration (AI Blog Generation System schema).
 * Uses the same one-statement-at-a-time approach as v15/v16.
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

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return rows.length > 0;
}

async function runMigration() {
  console.log('Running v17 migration (AI Blog Generation System schema)...');
  const sqlPath = path.join(__dirname, 'migrate-v17.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    console.error('v17 migration failed: no statements found in SQL file');
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
         VALUES ('v17', 'create', 'blog_posts: cover_image_url/source_topic/seo_title/seo_description/canonical_url/og_image; tables: blog_generation_jobs, blog_publish_jobs, blog_assets')
         ON CONFLICT DO NOTHING`
      );
    } catch (_) {
      console.log('  schema_audit table not found — skipping audit log (non-fatal)');
    }

    const requiredTables = ['blog_generation_jobs', 'blog_publish_jobs', 'blog_assets'];
    const missingTables = [];
    for (const t of requiredTables) {
      if (!(await tableExists(client, t))) missingTables.push(t);
    }
    if (missingTables.length > 0) {
      console.error(`v17 migration completed but REQUIRED TABLES ARE MISSING: ${missingTables.join(', ')}`);
      process.exit(1);
    }

    const requiredCols = ['cover_image_url', 'source_topic', 'seo_title', 'seo_description', 'canonical_url', 'og_image'];
    const missingCols = [];
    for (const col of requiredCols) {
      if (!(await columnExists(client, 'blog_posts', col))) missingCols.push(col);
    }
    if (missingCols.length > 0) {
      console.error(`v17 migration completed but REQUIRED COLUMNS ARE MISSING: ${missingCols.join(', ')}`);
      process.exit(1);
    }

    console.log('v17 migration completed successfully. Tables + columns verified.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
      console.log('  ROLLBACK ok.');
    } catch (_) {}
    console.error('v17 migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration().catch(() => process.exit(1));
