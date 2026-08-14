const blogAdminService = require('../services/blogAdminService');

function handleServiceError(res, err) {
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({ success: false, error: 'Blog post not found' });
  }
  if (err.code === 'NOT_APPROVED') {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.code === 'ALREADY_PUBLISHED') {
    return res.status(409).json({ success: false, error: err.message });
  }
  return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
}

async function generate(req, res) {
  try {
    const { topic, trigger_type } = req.body || {};
    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ success: false, error: 'topic is required' });
    }
    const result = await blogAdminService.generateAndStore({
      topic,
      triggerType: trigger_type === 'cron' ? 'cron' : 'admin',
    });
    return res.status(201).json({ success: true, post: result.post, job: result.job });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function regenerate(req, res) {
  try {
    const { id } = req.params;
    const result = await blogAdminService.regeneratePost(id, { topic: req.body?.topic });
    if (!result) return res.status(404).json({ success: false, error: 'Blog post not found' });
    return res.status(201).json({ success: true, post: result.post, job: result.job });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function approve(req, res) {
  try {
    const post = await blogAdminService.approvePost(req.params.id, { actor: req.user?.email || req.user?.name });
    if (!post) return res.status(404).json({ success: false, error: 'Blog post not found' });
    return res.json({ success: true, post });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function publish(req, res) {
  try {
    const result = await blogAdminService.publishPost(req.params.id, { actor: req.user?.email || req.user?.name });
    if (!result) return res.status(404).json({ success: false, error: 'Blog post not found' });
    return res.json({ success: true, post: result, publish_jobs: result.publish_jobs });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function list(req, res) {
  try {
    const result = await blogAdminService.listPosts(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function detail(req, res) {
  try {
    const post = await blogAdminService.getById(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Blog post not found' });
    return res.json({ success: true, post });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function update(req, res) {
  try {
    const post = await blogAdminService.updatePost(req.params.id, req.body || {});
    if (!post) return res.status(404).json({ success: false, error: 'Blog post not found' });
    return res.json({ success: true, post });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function remove(req, res) {
  try {
    const result = await blogAdminService.removePost(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Blog post not found' });
    return res.json({ success: true, deleted: result });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function jobs(req, res) {
  try {
    const result = await blogAdminService.listJobs(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function jobDetail(req, res) {
  try {
    const job = await blogAdminService.getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Generation job not found' });
    return res.json({ success: true, job });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

async function mcpStatus(req, res) {
  try {
    const status = await blogAdminService.getMcpStatusDetailed();
    return res.json({ success: true, mcp: status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  generate,
  regenerate,
  approve,
  publish,
  list,
  detail,
  update,
  remove,
  jobs,
  jobDetail,
  mcpStatus,
};
