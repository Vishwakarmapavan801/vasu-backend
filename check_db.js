if (!process.env.RENDER) {
  require('dotenv').config();
}
const pool = require('./src/config/database');

async function check() {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('agents','agent_reviews','agent_tour_requests','agent_followers','agent_profile_views','agent_listing_meta','agent_listing_views','agent_listing_inquiries','agent_review_responses','agent_activity_log','agent_posts','social_posts','feed_events')
    ORDER BY table_name
  `);
  console.log('=== Tables ===');
  tables.rows.forEach(r => console.log('  EXISTS:', r.table_name));

  const users = await pool.query('SELECT id, email, name, role FROM users LIMIT 10');
  console.log('\n=== Users ===');
  users.rows.forEach(u => console.log('  ', u.id, u.email, u.name, u.role));

  const agents = await pool.query('SELECT id, user_id, full_name, status, license_number FROM agents LIMIT 10');
  console.log('\n=== Agents ===');
  agents.rows.forEach(a => console.log('  ', a.id, a.user_id, a.full_name, a.status, a.license_number));

  const count = await pool.query('SELECT COUNT(*) FROM agents');
  console.log('\nTotal agents:', count.rows[0].count);
  
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
