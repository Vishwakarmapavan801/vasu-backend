const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'vasu',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
});

async function runMigration() {
  console.log('Running v9 migration: Platform Enhancement (Neighborhoods, Schools, CRM, Comparisons, AI, Analytics)...');
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, 'migrate-v9.sql'), 'utf8');
    await pool.query(sql);
    console.log('v9 migration completed successfully.');
  } catch (err) {
    console.error('v9 migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
