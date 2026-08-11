const asyncHandler = require('../../../middleware/asyncHandler');
const settingsAdminService = require('../services/settingsAdminService');
const auditService = require('../../../services/auditService');

const getSettings = asyncHandler(async (req, res) => {
  const { keys } = req.query;
  const keysList = typeof keys === 'string' ? keys.split(',').map((k) => k.trim()).filter(Boolean) : undefined;
  const result = await settingsAdminService.getSettings(keysList);
  res.json({ success: true, ...result });
});

const setSetting = asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const setting = await settingsAdminService.setSetting(key, value, req.user.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'settings.updated',
    targetType: 'setting',
    targetId: setting.key,
    details: { value },
  });
  res.json({ success: true, data: setting });
});

const deleteSetting = asyncHandler(async (req, res) => {
  const result = await settingsAdminService.deleteSetting(req.params.key, req.user.id);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Setting not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'settings.deleted',
    targetType: 'setting',
    targetId: req.params.key,
  });
  res.json({ success: true, data: result });
});

module.exports = { getSettings, setSetting, deleteSetting };
