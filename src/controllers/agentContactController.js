const pool = require('../config/database');

function badRequest(res, message) {
  return res.status(400).json({ success: false, error: message });
}

async function contactAgent(req, res, next) {
  try {
    const { agentId } = req.params;
    const userId = req.user?.id || null;
    const { name, email, phone, message, property_listing_key } = req.body;

    if (!agentId) return badRequest(res, 'Agent ID is required.');
    if (!name || !email || !message) return badRequest(res, 'Name, email, and message are required.');

    const agentExists = await pool.query('SELECT id FROM agent_profiles WHERE id = $1', [agentId]);
    if (agentExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found.' });
    }

    const result = await pool.query(
      `INSERT INTO agent_contacts (agent_id, user_id, name, email, phone, message, property_listing_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [agentId, userId, name, email, phone || '', message, property_listing_key || '']
    );

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent to the agent.',
      data: { id: result.rows[0].id },
    });
  } catch (err) {
    next(err);
  }
}

async function saveAgent(req, res, next) {
  try {
    const userId = req.user.id;
    const { agentId } = req.params;

    const agentExists = await pool.query('SELECT id FROM agent_profiles WHERE id = $1', [agentId]);
    if (agentExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found.' });
    }

    const existing = await pool.query(
      'SELECT id FROM saved_agents WHERE user_id = $1 AND agent_id = $2',
      [userId, agentId]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ success: true, message: 'Agent already saved.', data: { id: existing.rows[0].id } });
    }

    const result = await pool.query(
      'INSERT INTO saved_agents (user_id, agent_id) VALUES ($1, $2) RETURNING id',
      [userId, agentId]
    );

    return res.status(201).json({
      success: true,
      message: 'Agent saved to favorites.',
      data: { id: result.rows[0].id },
    });
  } catch (err) {
    next(err);
  }
}

async function unsaveAgent(req, res, next) {
  try {
    const userId = req.user.id;
    const { agentId } = req.params;
    const result = await pool.query(
      'DELETE FROM saved_agents WHERE user_id = $1 AND agent_id = $2 RETURNING id',
      [userId, agentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Saved agent not found.' });
    }
    return res.status(200).json({ success: true, message: 'Agent removed from saved.' });
  } catch (err) {
    next(err);
  }
}

async function listSavedAgents(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT sa.id AS saved_id, sa.created_at AS saved_at,
              ap.id, ap.name, ap.email, ap.phone, ap.photo_url, ap.role, ap.brokerage,
              ap.office_name, ap.experience_years, ap.response_time, ap.response_rate
       FROM saved_agents sa
       JOIN agent_profiles ap ON ap.id = sa.agent_id
       WHERE sa.user_id = $1
       ORDER BY sa.created_at DESC`,
      [userId]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { contactAgent, saveAgent, unsaveAgent, listSavedAgents };
