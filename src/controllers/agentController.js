const agentService = require('../services/agentService');
const { requireAuth } = require('../middleware/auth');

async function getAgentByMlsId(req, res, next) {
  try {
    const { memberId } = req.params;
    if (!memberId) {
      return res.status(400).json({ success: false, error: 'Member ID is required' });
    }
    const agent = await agentService.findByMlsMemberId(memberId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    return res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

async function getAgentById(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Agent ID is required' });
    }
    const agent = await agentService.findById(id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    return res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

async function searchAgents(req, res, next) {
  try {
    const { page, limit, search, sort, order, brokerage, areas_served } = req.query;
    const result = await agentService.search({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      search,
      sort,
      order,
      brokerage,
      areas_served,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function upsertAgent(req, res, next) {
  try {
    const { mls_member_id } = req.body;
    if (!mls_member_id) {
      return res.status(400).json({ success: false, error: 'mls_member_id is required' });
    }
    const agent = await agentService.upsert(mls_member_id, req.body);
    return res.status(agent.created_at === agent.updated_at ? 201 : 200).json({
      success: true, data: agent,
      message: agent.created_at === agent.updated_at ? 'Agent profile created' : 'Agent profile updated',
    });
  } catch (err) {
    next(err);
  }
}

async function updateAgent(req, res, next) {
  try {
    const { id } = req.params;
    const agent = await agentService.update(id, req.body);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    return res.json({ success: true, data: agent, message: 'Agent profile updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAgentByMlsId,
  getAgentById,
  searchAgents,
  upsertAgent,
  updateAgent,
};
