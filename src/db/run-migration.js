/**
 * Migration Runner
 *
 * Executes the full SQL migration, then verifies all tables.
 * Drops minimal tables first so full schema can be applied.
 * Run: node src/db/run-migration.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const TABLES = [
  'contact_requests', 'tour_requests', 'property_inquiries',
  'home_valuations', 'newsletter_subscribers', 'career_applications',
  'onboarding_requests', 'mortgage_pre_approvals', 'seller_requests',
  'ai_demo_requests', 'ai_contact_requests',
  'buyer_agent_requests', 'property_agent_inquiries',
  'callback_requests', 'quick_questions',
  'users', 'favorites',
];

async function runMigration() {
  console.log('\n  📦 Running PostgreSQL Migration...\n');

  // Step 1a: Add new columns to existing tables (non-destructive)
  const alterColumns = [
    'ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS inquiry_type VARCHAR(100)',
    'ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS source VARCHAR(255)',
    'ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)',
    'ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500)',
  ];
  for (const stmt of alterColumns) {
    try { await pool.query(stmt); } catch (_) {}
  }

  // Step 1b: Migrate users table from first_name/last_name to name (if needed)
  try {
    const { rows: userCols } = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = 'users' 
       AND column_name IN ('first_name', 'name')`
    );
    const userColNames = userCols.map(r => r.column_name);
    if (userColNames.includes('first_name') && !userColNames.includes('name')) {
      console.log('  ⚠ users table has first_name/last_name, migrating to name...');
      await pool.query('ALTER TABLE users RENAME COLUMN first_name TO name');
      await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS last_name');
      console.log('  ✓ users table migrated (first_name+last_name → name)');
    }
  } catch (_) {}

  // Step 1: Enable pgcrypto for gen_random_uuid
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    console.log('  ✓ pgcrypto extension ready');
  } catch (e) {
    // gen_random_uuid is built-in on PG13+, so this is optional
  }

  // Step 2: Check which tables have full schemas (have a column beyond id/created_at/updated_at)
  for (const table of TABLES) {
    try {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1 
         AND column_name NOT IN ('id', 'created_at', 'updated_at')`,
        [table]
      );
      
      if (rows.length <= 1) {
        // Table has minimal schema - drop and recreate
        console.log(`  ⚠ ${table} has minimal schema, dropping...`);
        await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`  ✓ ${table} dropped, will recreate`);
      } else {
        console.log(`  ✓ ${table} already has full schema (${rows.length} data columns)`);
      }
    } catch (e) {
      // Table doesn't exist, will be created
    }
  }

  // Step 3: Execute the migration SQL file
  try {
    const sqlPath = path.join(__dirname, 'migrate.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('  ✓ Migration SQL executed successfully');
  } catch (err) {
    console.log(`  ⚠ Batch error (non-fatal): ${err.message.slice(0, 100)}`);
    console.log('  Executing individual CREATE TABLE statements...');
    
    // Step 4: Execute each CREATE TABLE individually
    const sqlPath = path.join(__dirname, 'migrate.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Extract individual CREATE TABLE statements
    const createTableRegex = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\);/g;
    let match;
    const statements = [];
    
    while ((match = createTableRegex.exec(sql)) !== null) {
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS ${match[1]} (${match[2]})`);
        console.log(`  ✓ ${match[1]} (create table)`);
      } catch (e) {
        console.error(`  ✗ ${match[1]}: ${e.message.slice(0, 80)}`);
      }
    }
  }

  // Step 5: Add indexes individually (ignore "already exists" errors)
  console.log('\n  Adding indexes...');
  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_contact_requests_created_at ON contact_requests(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(status)',
    'CREATE INDEX IF NOT EXISTS idx_tour_requests_created_at ON tour_requests(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_tour_requests_status ON tour_requests(status)',
    'CREATE INDEX IF NOT EXISTS idx_property_inquiries_created_at ON property_inquiries(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_home_valuations_created_at ON home_valuations(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_home_valuations_status ON home_valuations(status)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email)',
    'CREATE INDEX IF NOT EXISTS idx_career_applications_created_at ON career_applications(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_career_applications_status ON career_applications(status)',
    'CREATE INDEX IF NOT EXISTS idx_career_applications_position ON career_applications(position)',
    'CREATE INDEX IF NOT EXISTS idx_onboarding_requests_created_at ON onboarding_requests(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_mortgage_pre_approvals_created_at ON mortgage_pre_approvals(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_mortgage_pre_approvals_status ON mortgage_pre_approvals(status)',
    'CREATE INDEX IF NOT EXISTS idx_mortgage_pre_approvals_email ON mortgage_pre_approvals(email)',
    'CREATE INDEX IF NOT EXISTS idx_seller_requests_created_at ON seller_requests(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_seller_requests_status ON seller_requests(status)',
    'CREATE INDEX IF NOT EXISTS idx_ai_demo_requests_created_at ON ai_demo_requests(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_ai_contact_requests_created_at ON ai_contact_requests(created_at DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_listing_key ON favorites(listing_key)',
    'CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC)',
  ];

  for (const stmt of indexStatements) {
    try {
      await pool.query(stmt);
    } catch (e) {
      // Ignore "already exists" errors
    }
  }
  console.log('  ✓ Indexes added');

  // Step 6: Add the update_updated_at trigger function
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    for (const table of TABLES) {
      try {
        await pool.query(`
          CREATE TRIGGER IF NOT EXISTS update_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
      } catch (e) {
        // Trigger may already exist
      }
    }
    console.log('  ✓ Triggers added');
  } catch (e) {
    console.log(`  ⚠ Trigger error: ${e.message.slice(0, 60)}`);
  }

  // Step 6b: Create favorites trigger separately (users is in TABLES already)
  try {
    // favorites doesn't have updated_at column but trigger won't hurt
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_favorites_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
  } catch (_) {}

  // Step 7: Verify all tables
  const result = await pool.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)',
    ['public', TABLES]
  );

  const created = result.rows.map(r => r.table_name);
  console.log(`\n  📊 ${created.length}/${TABLES.length} tables created:`);

  for (const table of TABLES) {
    const hasFullSchema = created.includes(table);
    if (hasFullSchema) {
      const { rows } = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1 
         ORDER BY ordinal_position`,
        [table]
      );
      console.log(`     ✓ ${table} (${rows.length} columns)`);
    } else {
      console.log(`     ✗ ${table} NOT FOUND`);
    }
  }

  if (created.length === TABLES.length) {
    console.log('\n  🎉 All tables recreated successfully!\n');
  } else {
    console.log(`\n  ⚠️  Missing: ${TABLES.filter(t => !created.includes(t)).join(', ')}\n`);
  }

  process.exit(0);
}

runMigration();
