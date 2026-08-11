const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { getAuditLog } = require('../services/auditService');

const router = Router();

router.get('/audit-log', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminId, action, targetType, limit, offset } = req.query;
    const result = await getAuditLog({
      adminId,
      action,
      targetType,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;