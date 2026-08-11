const asyncHandler = require('../../../middleware/asyncHandler');
const mlsAdminService = require('../services/mlsAdminService');
const auditService = require('../../../services/auditService');

const getStatus = asyncHandler(async (req, res) => {
  const status = await mlsAdminService.getStatus();
  res.json(status);
});

const triggerSync = asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!['full', 'incremental'].includes(type)) {
    return res.status(400).json({ success: false, error: 'Invalid sync type' });
  }
  const result = await mlsAdminService.triggerSync(type, req.user.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: `mls.sync_${type}`,
    targetType: 'mls',
    targetId: null,
  });
  res.json({ success: true, data: result });
});

const getQuality = asyncHandler(async (req, res) => {
  const quality = await mlsAdminService.getQuality();
  res.json(quality);
});

const clearError = asyncHandler(async (req, res) => {
  const { retryListing } = req.body;
  const result = await mlsAdminService.clearError(req.params.errorId, { retryListing });
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'mls.error_cleared',
    targetType: 'mls_error',
    targetId: req.params.errorId,
    details: { retryListing: !!retryListing },
  });
  res.json({ success: true, data: result });
});

module.exports = { getStatus, triggerSync, getQuality, clearError };
