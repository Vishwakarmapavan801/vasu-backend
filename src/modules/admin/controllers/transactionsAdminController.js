const asyncHandler = require('../../../middleware/asyncHandler');
const transactionsAdminService = require('../services/transactionsAdminService');
const auditService = require('../../../services/auditService');

const list = asyncHandler(async (req, res) => {
  const { status, agentId, search, limit, offset } = req.query;
  const result = await transactionsAdminService.list({
    status: status || undefined,
    agentId: agentId || undefined,
    search: search || undefined,
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: Math.max(0, parseInt(offset, 10) || 0),
  });
  res.json(result);
});

const getById = asyncHandler(async (req, res) => {
  const result = await transactionsAdminService.getById(req.params.id);
  res.json(result);
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const result = await transactionsAdminService.updateStatus(req.params.id, status, req.user.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'transactions.status_updated',
    targetType: 'transaction',
    targetId: req.params.id,
    details: { status },
  });
  res.json(result);
});

const addMilestone = asyncHandler(async (req, res) => {
  const { milestoneType, title, description, dueDate } = req.body;
  const result = await transactionsAdminService.addMilestone(req.params.id, {
    milestoneType,
    title,
    description,
    dueDate,
  }, req.user.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'transactions.milestone_added',
    targetType: 'transaction',
    targetId: req.params.id,
    details: { title },
  });
  res.json(result);
});

const updateMilestone = asyncHandler(async (req, res) => {
  const { title, description, dueDate, completed } = req.body;
  const result = await transactionsAdminService.updateMilestone(req.params.id, {
    title,
    description,
    dueDate,
    completed,
  });
  res.json(result);
});

const deleteMilestone = asyncHandler(async (req, res) => {
  const result = await transactionsAdminService.deleteMilestone(req.params.id);
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'transactions.milestone_deleted',
    targetType: 'transaction',
    targetId: req.params.id,
  });
  res.json(result);
});

module.exports = { list, getById, updateStatus, addMilestone, updateMilestone, deleteMilestone };
