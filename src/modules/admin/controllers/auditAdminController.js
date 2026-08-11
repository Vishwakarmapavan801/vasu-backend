const asyncHandler = require('../../../middleware/asyncHandler');
const auditService = require('../../../services/auditService');

const getLogs = asyncHandler(async (req, res) => {
  const { adminId, action, targetType, limit, offset } = req.query;
  const logs = await auditService.getAuditLog({
    adminId,
    action,
    targetType,
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: Math.max(0, parseInt(offset, 10) || 0),
  });
  res.json({ success: true, ...logs });
});

module.exports = { getLogs };
