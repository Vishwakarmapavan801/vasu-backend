const { requireAuth } = require('./auth');

/**
 * Roles allowed to access the admin panel.
 * 'admin' is retained for backward compatibility with routes that were
 * written before the RBAC roles were introduced. 'super_admin' is the
 * highest-privilege role and can assign roles / manage settings.
 */
const ADMIN_ROLES = new Set([
  'super_admin',
  'admin',
  'moderator',
  'mls_manager',
  'content_manager',
  'agent_manager',
]);

/**
 * Permission map — which roles may access each admin area.
 * Every admin route must declare a permission via requireRole('...').
 */
const ROLE_PERMISSIONS = {
  dashboard: ADMIN_ROLES,
  listings: new Set(['super_admin', 'admin', 'mls_manager']),
  mls: new Set(['super_admin', 'admin', 'mls_manager']),
  agents: new Set(['super_admin', 'admin', 'agent_manager']),
  users: new Set(['super_admin', 'admin', 'agent_manager']),
  posts: new Set(['super_admin', 'admin', 'moderator', 'content_manager']),
  leads: new Set(['super_admin', 'admin', 'agent_manager', 'mls_manager']),
  transactions: new Set(['super_admin', 'admin', 'agent_manager', 'mls_manager']),
  media: new Set(['super_admin', 'admin', 'moderator', 'content_manager', 'mls_manager']),
  settings: new Set(['super_admin', 'admin']),
  logs: new Set(['super_admin', 'admin']),
  roles: new Set(['super_admin']),
};

function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

/**
 * Gate a request behind authentication + any admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (!isAdminRole(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  next();
}

/**
 * Gate a request behind authentication + a specific admin permission.
 * Usage: router.get('/...', requireAuth, requireRole('listings'), handler)
 *
 * @param {string} permission - key into ROLE_PERMISSIONS
 */
function requireRole(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const allowed = ROLE_PERMISSIONS[permission];
    if (!allowed) {
      return res.status(403).json({ success: false, error: `Unknown permission: ${permission}` });
    }

    if (!allowed.has(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Your role (${req.user.role}) does not have access to ${permission}`,
      });
    }

    next();
  };
}

module.exports = { requireAdmin, requireRole, requireAuth, isAdminRole, ADMIN_ROLES, ROLE_PERMISSIONS };


