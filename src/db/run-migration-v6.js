/**
 * V6 Migration Runner — Agent Module Schema
 *
 * Run: node src/db/run-migration-v6.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  console.log('\n  \u{1F4E6} Running V6 Migration (Agent Module Schema)...\n');

  const sqlPath = path.join(__dirname, 'migrate-v6.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await pool.query(stmt + ';');
      const label = stmt.split(/\s+/).slice(0, 4).join(' ');
      console.log(`  \u2713 ${label}...`);
    } catch (err) {
      console.error(`  \u2717 ${stmt.slice(0, 60)}: ${err.message.slice(0, 80)}`);
    }
  }

  const tables = [
    'agents', 'agent_reviews', 'agent_tour_requests',
    'agent_posts', 'agent_followers', 'agent_profile_views',
    'agent_saved_posts', 'agent_notifications',
  ];

  for (const table of tables) {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );

    if (rows.length > 0) {
      const { rows: cols } = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table]
      );
      console.log(`\n  \u2713 ${table} created (${cols.length} columns):`);
      for (const col of cols) {
        console.log(`    \u00B7 ${col.column_name} (${col.data_type})`);
      }
    } else {
      console.log(`\n  \u2717 ${table} NOT found`);
    }
  }

  console.log('\n  \u{1F389} V6 migration complete!\n');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
