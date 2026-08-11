if (!process.env.RENDER) { require('dotenv').config(); }
const pool = require('./src/config/database');

async function run() {
  const sql = `
    CREATE TABLE IF NOT EXISTS agent_tour_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      property_id VARCHAR(255),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      preferred_date DATE NOT NULL,
      preferred_time VARCHAR(50) NOT NULL,
      message TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS agent_followers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(agent_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS agent_profile_views (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_tour_requests_agent_id ON agent_tour_requests(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_followers_agent_id ON agent_followers(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_profile_views_agent_id ON agent_profile_views(agent_id);

    -- Ensure agents table has all needed columns
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_listings_sold INTEGER DEFAULT 0;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_listings_active INTEGER DEFAULT 0;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS mls_member_id VARCHAR(255);
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS service_areas TEXT[] DEFAULT '{}';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS business_hours JSONB;

    -- Add agent_id to JWT by adding an is_agent column to users if needed
    -- Also ensure the feed flow tables exist  
    CREATE TABLE IF NOT EXISTS social_post_listings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
      listing_key VARCHAR(255),
      listing_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_social_post_listings_post ON social_post_listings(post_id);
  `;
  
  try {
    await pool.query(sql);
    console.log('✓ Missing tables created');
  } catch (err) {
    console.error('✗ Error:', err.message);
  }

  // Verify
  const tables = ['agent_tour_requests','agent_followers','agent_profile_views'];
  for (const t of tables) {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]);
    console.log(`  ${rows.length ? '✓' : '✗'} ${t}`);
  }
  
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
