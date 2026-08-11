const agentService = require('../services/agentService');
const agentValidator = require('../validators/agentValidator');
const { logAdminAction } = require('../../../services/auditService');

async function listAgents(req, res, next) {
  try {
    const { page, limit, search, city, state, specialty, language, minRating, verifiedOnly, sort, order } = req.query;
    const result = await agentService.listAgents({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      search, city, state, specialty, language,
      minRating: minRating ? parseFloat(minRating) : undefined,
      verifiedOnly: verifiedOnly === 'true',
      sort, order,
    });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination, message: 'Agents retrieved successfully' });
  } catch (err) { next(err); }
}

async function getAgentById(req, res, next) {
  try {
    const { id } = req.params;
    const agent = await agentService.getAgentById(id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    return res.status(200).json({ success: true, data: agent, message: 'Agent retrieved successfully' });
  } catch (err) { next(err); }
}

async function getAgentStats(req, res, next) {
  try {
    const { id } = req.params;
    const stats = await agentService.getAgentStats(id);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    return res.status(200).json({ success: true, data: stats, message: 'Agent stats retrieved successfully' });
  } catch (err) { next(err); }
}

async function getAgentListings(req, res, next) {
  try {
    const { id } = req.params;
    const listings = await agentService.getListings(id);
    return res.status(200).json({ success: true, data: listings, message: 'Listings retrieved successfully' });
  } catch (err) { next(err); }
}

async function getAgentSold(req, res, next) {
  try {
    const { id } = req.params;
    const listings = await agentService.getSoldListings(id);
    return res.status(200).json({ success: true, data: listings, message: 'Sold properties retrieved successfully' });
  } catch (err) { next(err); }
}

async function registerAgent(req, res, next) {
  try {
    const errors = agentValidator.validateRegistration(req.body);
    if (errors) {
      return res.status(400).json({ success: false, error: 'Validation failed', fields: errors });
    }
    const agent = await agentService.registerAgent({ ...req.body, user_id: req.user.id });
    return res.status(201).json({ success: true, data: agent, message: 'Agent registered successfully' });
  } catch (err) { next(err); }
}

async function updateAgent(req, res, next) {
  try {
    const { id } = req.params;
    const agent = await agentService.updateAgent(id, req.body, req.user);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    return res.status(200).json({ success: true, data: agent, message: 'Agent profile updated successfully' });
  } catch (err) { next(err); }
}

async function approveAgent(req, res, next) {
  try {
    const { id } = req.params;
    const agent = await agentService.approveAgent(id, req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    logAdminAction({ adminId: req.user.id, action: 'approve_agent', targetType: 'agent', targetId: id });
    return res.status(200).json({ success: true, data: agent, message: 'Agent approved successfully' });
  } catch (err) { next(err); }
}

async function rejectAgent(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const agent = await agentService.rejectAgent(id, req.user.id, reason);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    logAdminAction({ adminId: req.user.id, action: 'reject_agent', targetType: 'agent', targetId: id, details: { reason } });
    return res.status(200).json({ success: true, data: agent, message: 'Agent rejected' });
  } catch (err) { next(err); }
}

module.exports = {
  listAgents,
  getAgentById,
  getAgentStats,
  getAgentListings,
  getAgentSold,
  registerAgent,
  updateAgent,
  approveAgent,
  rejectAgent,
};
