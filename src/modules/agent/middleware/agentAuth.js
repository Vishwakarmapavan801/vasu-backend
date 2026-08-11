const pool = require('../../../config/database');

function isAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  if (user.is_admin) return true;
  return false;
}

async function requireAgentOwner(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const agentId = req.params.id || req.params.agentId || req.body.agent_id;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'Agent ID is required' });
    }

    const { rows } = await pool.query(
      'SELECT user_id FROM agents WHERE id = $1',
      [agentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    if (rows[0].user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'You do not own this agent profile' });
    }

    req.agent = { id: agentId, user_id: rows[0].user_id };
    next();
  } catch (err) {
    next(err);
  }
}

async function requireApprovedAgent(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const agentId = req.params.id || req.params.agentId || req.body.agent_id;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'Agent ID is required' });
    }

    const { rows } = await pool.query(
      'SELECT id, status, user_id FROM agents WHERE id = $1',
      [agentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const agent = rows[0];

    if (agent.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: `Agent profile is ${agent.status}. Only approved agents can perform this action.`,
      });
    }

    if (agent.user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireAgentOwner,
  requireApprovedAgent,
  requireAdmin,
  isAdmin,
};
