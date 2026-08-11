const asyncHandler = require('../../../middleware/asyncHandler');
const leadsAdminService = require('../services/leadsAdminService');
const auditService = require('../../../services/auditService');

const list = asyncHandler(async (req, res) => {
  const result = await leadsAdminService.list(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const lead = await leadsAdminService.getById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, error: 'Lead not found' });
  }
  res.json({ success: true, data: lead });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const lead = await leadsAdminService.updateStatus(req.params.id, status, req.user.id);
  if (!lead) {
    return res.status(404).json({ success: false, error: 'Lead not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: `lead.${status}`,
    targetType: 'lead',
    targetId: req.params.id,
  });
  res.json({ success: true, data: lead });
});

const reassign = asyncHandler(async (req, res) => {
  const { agentId } = req.body;
  const lead = await leadsAdminService.reassign(req.params.id, agentId, req.user.id);
  if (!lead) {
    return res.status(404).json({ success: false, error: 'Lead not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'lead.reassigned',
    targetType: 'lead',
    targetId: req.params.id,
    details: { agentId },
  });
  res.json({ success: true, data: lead });
});

module.exports = { list, getById, updateStatus, reassign };
