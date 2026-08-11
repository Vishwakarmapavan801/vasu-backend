const asyncHandler = require('../../../middleware/asyncHandler');
const usersAdminService = require('../services/usersAdminService');
const auditService = require('../../../services/auditService');

const list = asyncHandler(async (req, res) => {
  const result = await usersAdminService.list(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const user = await usersAdminService.getById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  res.json({ success: true, data: user });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const user = await usersAdminService.updateStatus(req.params.id, status, req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: `user.${status}`,
    targetType: 'user',
    targetId: req.params.id,
  });
  res.json({ success: true, data: user });
});

const updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (req.user.id === req.params.id) {
    return res.status(400).json({ success: false, error: 'You cannot change your own role' });
  }
  const user = await usersAdminService.updateRole(req.params.id, role, req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'user.role_changed',
    targetType: 'user',
    targetId: req.params.id,
    details: { role },
  });
  res.json({ success: true, data: user });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const result = await usersAdminService.resetPassword(req.params.id, password);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'user.password_reset',
    targetType: 'user',
    targetId: req.params.id,
  });
  res.json({ success: true, data: result });
});

const roleSummary = asyncHandler(async (req, res) => {
  const roles = await usersAdminService.getRoleSummary();
  res.json({ success: true, data: roles });
});

module.exports = { list, getById, updateStatus, updateRole, resetPassword, roleSummary };
