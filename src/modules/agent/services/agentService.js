const agentRepo = require('../repositories/agentRepository');

let mlsService;
try {
  mlsService = require('../../../services/mlsService');
} catch (e) {
  mlsService = null;
}

async function list(params) {
  return agentRepo.findAll(params);
}

async function getById(id) {
  const agent = await agentRepo.findById(id);
  if (!agent) return null;

  const stats = await agentRepo.getStats(id);
  return { ...agent, stats };
}

async function getByUserId(userId) {
  return agentRepo.findByUserId(userId);
}

async function register(userId, data) {
  const existing = await agentRepo.findByUserId(userId);
  if (existing) {
    throw new Error('Agent profile already exists for this user');
  }

  const agentData = {
    ...data,
    user_id: userId,
    status: 'pending',
  };

  return agentRepo.create(agentData);
}

async function updateProfile(agentId, userId, data) {
  const agent = await agentRepo.findById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.user_id !== userId) throw new Error('Unauthorized to update this profile');

  return agentRepo.update(agentId, data);
}

async function approve(agentId, adminId) {
  const agent = await agentRepo.findById(agentId);
  if (!agent) throw new Error('Agent not found');

  await agentRepo.updateVerification(agentId, true);
  return agentRepo.updateStatus(agentId, 'approved');
}

async function reject(agentId, adminId, reason) {
  const agent = await agentRepo.findById(agentId);
  if (!agent) throw new Error('Agent not found');

  if (reason) {
    await agentRepo.update(agentId, { rejection_reason: reason });
  }

  return agentRepo.updateStatus(agentId, 'rejected');
}

async function getStats(agentId) {
  return agentRepo.getStats(agentId);
}

async function getListings(agentId) {
  if (!mlsService) return [];

  try {
    const agent = await agentRepo.findById(agentId);
    if (!agent) return [];

    const mlsMemberId = agent.license_number || agent.id;
    const response = await mlsService.fetchWithRetry(
      `${process.env.MLS_GRID_BASE_URL || 'https://api.mlsgrid.com/v2'}/Property?$filter=ListAgentMlsId%20eq%20'${encodeURIComponent(mlsMemberId)}'&$top=50`
    );

    if (response && response.value) {
      return response.value.map(item => mlsService.normalizeProperty(item));
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function getSoldListings(agentId) {
  if (!mlsService) return [];

  try {
    const agent = await agentRepo.findById(agentId);
    if (!agent) return [];

    const mlsMemberId = agent.license_number || agent.id;
    const response = await mlsService.fetchWithRetry(
      `${process.env.MLS_GRID_BASE_URL || 'https://api.mlsgrid.com/v2'}/Property?$filter=ListAgentMlsId%20eq%20'${encodeURIComponent(mlsMemberId)}'%20and%20MlsStatus%20eq%20'Sold'&$top=50`
    );

    if (response && response.value) {
      return response.value.map(item => mlsService.normalizeProperty(item));
    }
    return [];
  } catch (e) {
    return [];
  }
}

module.exports = {
  list,
  getById,
  getByUserId,
  register,
  updateProfile,
  approve,
  reject,
  getStats,
  getListings,
  getSoldListings,
};
