const asyncHandler = require('../../../middleware/asyncHandler');
const postsAdminService = require('../services/postsAdminService');
const auditService = require('../../../services/auditService');

const list = asyncHandler(async (req, res) => {
  const result = await postsAdminService.list(req.query);
  res.json({ success: true, ...result });
});

const getById = asyncHandler(async (req, res) => {
  const post = await postsAdminService.getById(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }
  res.json({ success: true, data: post });
});

const moderate = asyncHandler(async (req, res) => {
  const { visibility } = req.body;
  const post = await postsAdminService.setVisibility(req.params.id, visibility, req.user.id);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: `post.${visibility}`,
    targetType: 'post',
    targetId: req.params.id,
  });
  res.json({ success: true, data: post });
});

const remove = asyncHandler(async (req, res) => {
  const result = await postsAdminService.remove(req.params.id, req.user.id);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }
  await auditService.logAdminAction({
    adminId: req.user.id,
    action: 'post.removed',
    targetType: 'post',
    targetId: req.params.id,
  });
  res.json({ success: true, data: result });
});

module.exports = { list, getById, moderate, remove };
