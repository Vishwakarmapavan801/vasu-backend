/**
 * v4 Migration Runner
 *
 * Adds the following tables/columns:
 * - saved_searches
 * - notifications
 * - saved_agents
 * - agent_contacts
 * - review_reports
 * - user_activity_log
 * - ALTER existing form tables to add user_id columns
 *
 * Usage: node src/db/run-migration-v4.js
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  console.log('\n  Vasu Realty - v4 Migration');
  console.log('  ──────────────────────────\n');

  const sqlPath = path.join(__dirname, 'migrate-v4.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('  ✓ v4 migration completed successfully\n');
    process.exit(0);
  } catch (err) {
    console.error('  ✗ v4 migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
