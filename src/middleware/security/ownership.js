// Ownership verification middleware
// Verifies that the authenticated user owns the resource being accessed
// Admins can bypass ownership checks

const pool = require('../../config/database');

function isAdmin(user) {
  return user && user.role === 'admin';
}

// Generic ownership check: pass table, id column, owner column, and param name
function verifyOwnership(table, idColumn = 'id', ownerColumn = 'user_id', paramName = 'id') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (isAdmin(req.user)) {
        return next();
      }

      const resourceId = req.params[paramName];
      if (!resourceId) return res.status(400).json({ success: false, error: 'Resource ID required' });

      const { rows } = await pool.query(
        `SELECT ${ownerColumn} FROM ${table} WHERE ${idColumn} = $1`,
        [resourceId]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }

      if (rows[0][ownerColumn] !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// Agent ownership — verifies agent owns the resource
function verifyAgentOwnership(table, idColumn = 'id', ownerColumn = 'agent_id', paramName = 'id') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (isAdmin(req.user)) {
        return next();
      }

      const resourceId = req.params[paramName];
      if (!resourceId) return res.status(400).json({ success: false, error: 'Resource ID required' });
      if (!req.agentId) return res.status(403).json({ success: false, error: 'Agent authentication required' });

      const { rows } = await pool.query(
        `SELECT ${ownerColumn} FROM ${table} WHERE ${idColumn} = $1`,
        [resourceId]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }

      if (rows[0][ownerColumn] !== req.agentId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { verifyOwnership, verifyAgentOwnership };
