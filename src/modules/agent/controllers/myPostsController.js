const agentService = require('../services/agentService');
const postService = require('../services/postService');

async function getMyProfile(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    return res.status(200).json({ success: true, data: agent, message: 'Agent profile retrieved' });
  } catch (err) { next(err); }
}

async function createPost(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found. Create an agent account first.' });
    }
    if (agent.status !== 'approved') {
      return res.status(403).json({ success: false, error: `Agent account is ${agent.status}. Must be approved to create posts.` });
    }
    const post = await postService.create(agent.id, { ...req.body, author_id: req.user.id });
    return res.status(201).json({ success: true, data: post, message: 'Post created successfully' });
  } catch (err) { next(err); }
}

async function listMyPosts(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    const { page, limit, sort, order, post_type, visibility } = req.query;
    const result = await postService.list(agent.id, { page, limit, sort, order, post_type, visibility });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) { next(err); }
}

async function updateMyPost(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    const post = await postService.update(req.params.id, agent.id, req.body);
    return res.status(200).json({ success: true, data: post, message: 'Post updated successfully' });
  } catch (err) {
    if (err.message === 'Post not found or unauthorized') {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
}

async function deleteMyPost(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    await postService.remove(req.params.id, agent.id);
    return res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    if (err.message === 'Post not found or unauthorized') {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
}

async function getMyMlsListings(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    let mlsService;
    try {
      mlsService = require('../../../services/mlsService');
    } catch (e) {
      mlsService = null;
    }
    let listings = [];
    if (mlsService && agent.license_number) {
      try {
        const response = await mlsService.fetchWithRetry(
          `${process.env.MLS_GRID_BASE_URL || 'https://api-demo.mlsgrid.com/v2'}/Property?$filter=ListAgentMlsId%20eq%20'${encodeURIComponent(agent.license_number)}'&$top=50`
        );
        if (response && response.value) {
          listings = response.value.map(item => mlsService.normalizeProperty(item));
        }
      } catch (e) {
        listings = [];
      }
    }
    return res.status(200).json({ success: true, data: listings, message: 'MLS listings retrieved' });
  } catch (err) { next(err); }
}

async function createAgentAccount(req, res, next) {
  try {
    const existing = await agentService.getByUserId(req.user.id);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Agent profile already exists' });
    }
    const status = process.env.NODE_ENV === 'development' ? 'approved' : 'pending';
  const agent = await agentService.register(req.user.id, { ...req.body, status });
  return res.status(201).json({ success: true, data: agent, message: `Agent account created.${status === 'approved' ? ' Ready to use!' : ' Pending approval.'}` });
  } catch (err) { next(err); }
}

module.exports = {
  getMyProfile,
  createPost,
  listMyPosts,
  updateMyPost,
  deleteMyPost,
  getMyMlsListings,
  createAgentAccount,
};
