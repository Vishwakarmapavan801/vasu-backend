if (!process.env.RENDER) { require('dotenv').config(); }
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/database');

async function run() {
  const versions = ['v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12'];
  
  for (const v of versions) {
    const sqlPath = path.join(__dirname, 'src', 'db', `migrate-${v}.sql`);
    if (!fs.existsSync(sqlPath)) { console.log(`  SKIP ${v} - no file`); continue; }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    try {
      await pool.query(sql);
      console.log(`  ✓ ${v} migration applied`);
    } catch (err) {
      console.log(`  ✗ ${v} error: ${err.message.slice(0, 200)}`);
    }
  }

  const tables = ['agents','agent_reviews','agent_tour_requests','agent_followers','agent_profile_views','agent_listing_meta','agent_listing_views','agent_listing_inquiries','agent_review_responses','agent_activity_log','agent_posts','social_post_media','social_likes','social_comments','social_saves','social_follows','social_post_listings','feed_events','analytics_events'];
  for (const t of tables) {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]);
    console.log(`  ${rows.length ? '✓' : '✗'} ${t}`);
  }

  console.log('\nDone');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
