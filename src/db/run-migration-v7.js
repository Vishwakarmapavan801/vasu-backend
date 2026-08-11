const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
  console.log('\n  Vasu Realty - v7 Agent Dashboard Migration');
  console.log('  ─────────────────────────────────────────\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrate-v7.sql'), 'utf8');
    await pool.query(sql);
    console.log('  ✓ v7 migration completed successfully\n');
  } catch (err) {
    console.error('  ✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
