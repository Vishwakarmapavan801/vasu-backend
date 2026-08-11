const asyncHandler = require('../../../middleware/asyncHandler');
const agentAdminService = require('../services/agentAdminService');
const auditService = require('../../../services/auditService');

const list = asyncHandler(async (req, res) => {
  const result = await agentAdminService.list(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const agent = await agentAdminService.getById(req.params.id);
  if (!agent) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }
  res.json({ success: true, data: agent });
});

const getListings = asyncHandler(async (req, res) => {
  const listings = await agentAdminService.getListings(req.params.id);
  res.json({ success: true, data: listings });
});

const getSoldListings = asyncHandler(async (req, res) => {
  const listings = await agentAdminService.getSoldListings(req.params.id);
  res.json({ success: true, data: listings });
});

const approve = asyncHandler(async (req, res) => {
  const agent = await agentAdminService.approve(req.params.id, req.user.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.approved',
    targetType: 'agent',
    targetId: req.params.id,
  });
  res.json({ success: true, data: agent });
});

const reject = asyncHandler(async (req, res) => {
  const reason = (req.body.reason || '').trim();
  const agent = await agentAdminService.reject(req.params.id, req.user.id, reason);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.rejected',
    targetType: 'agent',
    targetId: req.params.id,
    details: { reason },
  });
  res.json({ success: true, data: agent });
});

const suspend = asyncHandler(async (req, res) => {
  const agent = await agentAdminService.suspend(req.params.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.suspended',
    targetType: 'agent',
    targetId: req.params.id,
  });
  res.json({ success: true, data: agent });
});

const reactivate = asyncHandler(async (req, res) => {
  const agent = await agentAdminService.reactivate(req.params.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.reactivated',
    targetType: 'agent',
    targetId: req.params.id,
  });
  res.json({ success: true, data: agent });
});

const verify = asyncHandler(async (req, res) => {
  const agent = await agentAdminService.verify(req.params.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.verified',
    targetType: 'agent',
    targetId: req.params.id,
  });
  res.json({ success: true, data: agent });
});

const feature = asyncHandler(async (req, res) => {
  const { featured, priority } = req.body;
  const agent = await agentAdminService.feature(req.params.id, { featured, priority });
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: featured ? 'agent.featured' : 'agent.unfeatured',
    targetType: 'agent',
    targetId: req.params.id,
    details: { priority },
  });
  res.json({ success: true, data: agent });
});

const remove = asyncHandler(async (req, res) => {
  const agent = await agentAdminService.remove(req.params.id);
  if (!agent) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.deleted',
    targetType: 'agent',
    targetId: req.params.id,
  });
  res.json({ success: true, data: agent });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const result = await agentAdminService.resetPassword(req.params.id, password);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'agent.password_reset',
    targetType: 'agent',
    targetId: req.params.id,
  });
  res.json({ success: true, data: result });
});

module.exports = {
  list,
  getById,
  getListings,
  getSoldListings,
  approve,
  reject,
  suspend,
  reactivate,
  verify,
  feature,
  remove,
  resetPassword,
};
