const pool = require('../../../config/database');

// ================================================================
// FEATURED LISTINGS
// ================================================================
async function getFeaturedListings(query = {}) {
  const { limit = 50, offset = 0, active_only } = query;
  const conditions = [];
  const params = [];
  if (active_only !== 'false') { conditions.push('fl.is_active = TRUE'); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT fl.* FROM featured_listings fl ${where} ORDER BY fl.priority DESC, fl.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { data: rows, limit, offset };
}

async function createFeaturedListing(agentId, data) {
  const { listing_key, plan_type, starts_at, ends_at, priority } = data;
  const { rows } = await pool.query(
    `INSERT INTO featured_listings (listing_key, agent_id, plan_type, starts_at, ends_at, priority)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (listing_key) DO UPDATE SET is_active = TRUE, updated_at = NOW()
     RETURNING *`,
    [listing_key, agentId, plan_type || 'basic', starts_at || new Date(), ends_at, priority || 0]
  );
  return rows[0];
}

async function deactivateFeaturedListing(id, agentId) {
  const { rows } = await pool.query(
    `UPDATE featured_listings SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND agent_id = $2 RETURNING *`,
    [id, agentId]
  );
  return rows[0] || null;
}

// ================================================================
// FEATURED AGENTS
// ================================================================
async function getFeaturedAgents(query = {}) {
  const { limit = 20, offset = 0, active_only } = query;
  const conditions = [];
  const params = [limit, offset];
  if (active_only !== 'false') { conditions.push('fa.is_active = TRUE'); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT fa.*, a.name AS agent_name, a.email AS agent_email, a.office_name, a.average_rating, a.total_reviews, a.cover_photo_url
     FROM featured_agents fa JOIN agents a ON fa.agent_id = a.id ${where}
     ORDER BY fa.priority DESC, fa.created_at DESC LIMIT $1 OFFSET $2`,
    params
  );
  return { data: rows, limit, offset };
}

async function createFeaturedAgent(data) {
  const { agent_id, plan_type, starts_at, ends_at, priority } = data;
  const { rows } = await pool.query(
    `INSERT INTO featured_agents (agent_id, plan_type, starts_at, ends_at, priority) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [agent_id, plan_type || 'basic', starts_at || new Date(), ends_at, priority || 0]
  );
  return rows[0];
}

async function deactivateFeaturedAgent(id) {
  const { rows } = await pool.query(
    `UPDATE featured_agents SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`, [id]
  );
  return rows[0] || null;
}

// ================================================================
// SUBSCRIPTION PLANS
// ================================================================
async function getSubscriptionPlans(query = {}) {
  const { active_only } = query;
  const conditions = [];
  if (active_only !== 'false') { conditions.push('is_active = TRUE'); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT * FROM subscription_plans ${where} ORDER BY price_monthly ASC`);
  return { data: rows };
}

async function createSubscriptionPlan(data) {
  const { name, plan_type, price_monthly, price_yearly, features, limits } = data;
  const { rows } = await pool.query(
    `INSERT INTO subscription_plans (name, plan_type, price_monthly, price_yearly, features, limits)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, plan_type || 'agent', price_monthly, price_yearly, JSON.stringify(features || {}), JSON.stringify(limits || {})]
  );
  return rows[0];
}

// ================================================================
// AGENT SUBSCRIPTIONS
// ================================================================
async function getAgentSubscriptions(agentId) {
  const { rows } = await pool.query(
    `SELECT asub.*, sp.name AS plan_name, sp.price_monthly, sp.features, sp.limits
     FROM agent_subscriptions asub JOIN subscription_plans sp ON asub.plan_id = sp.id
     WHERE asub.agent_id = $1 ORDER BY asub.created_at DESC`,
    [agentId]
  );
  return rows;
}

async function createAgentSubscription(agentId, data) {
  const { plan_id, billing_cycle, current_period_end } = data;
  const { rows } = await pool.query(
    `INSERT INTO agent_subscriptions (agent_id, plan_id, billing_cycle, current_period_end)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [agentId, plan_id, billing_cycle || 'monthly', current_period_end]
  );
  return rows[0];
}

async function cancelAgentSubscription(id, agentId) {
  const { rows } = await pool.query(
    `UPDATE agent_subscriptions SET status = 'cancelled', canceled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND agent_id = $2 RETURNING *`,
    [id, agentId]
  );
  return rows[0] || null;
}

module.exports = {
  getFeaturedListings, createFeaturedListing, deactivateFeaturedListing,
  getFeaturedAgents, createFeaturedAgent, deactivateFeaturedAgent,
  getSubscriptionPlans, createSubscriptionPlan,
  getAgentSubscriptions, createAgentSubscription, cancelAgentSubscription,
};
