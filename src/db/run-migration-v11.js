const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  console.log('Running v11 migration...');
  const sqlPath = path.join(__dirname, 'migrate-v11.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');

  // Remove the parameterized INSERT at the end — run separately
  const insertIdx = sql.lastIndexOf('INSERT INTO schema_audit');
  const ddlSql = insertIdx >= 0 ? sql.slice(0, insertIdx).trim() : sql.trim();
  const insertSql = insertIdx >= 0 ? sql.slice(insertIdx) : null;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Run all DDL (no parameters needed)
    if (ddlSql) {
      await client.query(ddlSql);
    }

    // Log migration
    if (insertSql) {
      const details = {
        migration: 'v11',
        tables: [
          'billing_invoices', 'billing_events', 'mls_sync_status', 'mls_sync_errors',
          'mls_compliance_log', 'email_logs', 'calendar_tokens', 'user_devices',
          'api_keys', 'schema_audit',
        ],
        columns: [
          'agents.notification_preferences', 'agents.business_hours',
          'agents.service_areas', 'agents.timezone', 'users.stripe_customer_id',
          'users.phone', 'users.phone_verified', 'properties.mls_updated_at',
          'properties.sync_status', 'properties.compliance_status',
        ],
      };
      await client.query(
        `INSERT INTO schema_audit (migration, action, details)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        ['v11', 'create_all_tables', JSON.stringify(details)]
      );
    }

    await client.query('COMMIT');
    console.log('v11 migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('v11 migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration().catch(() => process.exit(1));
