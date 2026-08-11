/**
 * v3 Migration Runner
 *
 * Creates the following tables if they don't already exist:
 * - agent_profiles
 * - agent_reviews
 * - property_history
 * - recently_viewed
 * - property_comparisons
 *
 * Usage: node src/db/run-migration-v3.js
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  console.log('\n  Vasu Realty - v3 Migration');
  console.log('  ──────────────────────────\n');

  const sqlPath = path.join(__dirname, 'migrate-v3.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('  ✓ v3 migration completed successfully\n');
    process.exit(0);
  } catch (err) {
    console.error('  ✗ v3 migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
