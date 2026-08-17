const asyncHandler = require('../../../middleware/asyncHandler');
const enquiriesAdminService = require('../services/enquiriesAdminService');
const auditService = require('../../../services/auditService');

const list = asyncHandler(async (req, res) => {
  const result = await enquiriesAdminService.list(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const enquiry = await enquiriesAdminService.getById(req.params.source, req.params.id);
  if (!enquiry) {
    return res.status(404).json({ success: false, error: 'Enquiry not found' });
  }
  res.json({ success: true, data: enquiry });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const enquiry = await enquiriesAdminService.updateStatus(req.params.source, req.params.id, status);
  if (!enquiry) {
    return res.status(404).json({ success: false, error: 'Enquiry not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: `enquiry.${req.params.source}.status.${status}`,
    targetType: `enquiry:${req.params.source}`,
    targetId: req.params.id,
  });
  res.json({ success: true, data: enquiry });
});

const assignAgent = asyncHandler(async (req, res) => {
  const { agentId } = req.body;
  const enquiry = await enquiriesAdminService.assignAgent(req.params.source, req.params.id, agentId);
  if (!enquiry) {
    return res.status(404).json({ success: false, error: 'Enquiry not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: `enquiry.${req.params.source}.assigned`,
    targetType: `enquiry:${req.params.source}`,
    targetId: req.params.id,
    details: { agentId },
  });
  res.json({ success: true, data: enquiry });
});

module.exports = { list, getById, updateStatus, assignAgent };
