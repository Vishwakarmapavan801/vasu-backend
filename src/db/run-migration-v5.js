/**
 * V5 Migration Runner — Email Verification
 *
 * Run: node src/db/run-migration-v5.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  console.log('\n  📦 Running V5 Migration (Email Verification)...\n');

  const sqlPath = path.join(__dirname, 'migrate-v5.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await pool.query(stmt + ';');
      const label = stmt.split(/\s+/).slice(0, 4).join(' ');
      console.log(`  ✓ ${label}...`);
    } catch (err) {
      console.error(`  ✗ ${stmt.slice(0, 60)}: ${err.message.slice(0, 80)}`);
    }
  }

  // Verify new table
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'email_verification_tokens'`
  );

  if (rows.length > 0) {
    const { rows: cols } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'email_verification_tokens'
       ORDER BY ordinal_position`
    );
    console.log(`\n  ✓ email_verification_tokens created (${cols.length} columns):`);
    for (const col of cols) {
      console.log(`    · ${col.column_name} (${col.data_type})`);
    }
  } else {
    console.log('\n  ✗ email_verification_tokens NOT found');
  }

  console.log('\n  🎉 V5 migration complete!\n');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
