const postService = require('../services/postService');

async function listAgentPosts(req, res, next) {
  try {
    const { id } = req.params;
    const { page, limit, sort, order } = req.query;
    const result = await postService.list(id, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      sort, order,
      publishedOnly: true,
    });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination, message: 'Posts retrieved successfully' });
  } catch (err) { next(err); }
}

async function createPost(req, res, next) {
  try {
    const { id } = req.params;
    const { title, content, excerpt, cover_image, tags, published } = req.body;
    const errors = {};
    if (!title || !title.trim()) errors.title = 'Title is required';
    if (!content || !content.trim()) errors.content = 'Content is required';
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, error: 'Validation failed', fields: errors });
    }
    const post = await postService.create(id, {
      author_id: req.user.id,
      title: title.trim(),
      content,
      excerpt: (excerpt || '').trim(),
      cover_image: cover_image || null,
      tags: tags || [],
      published: published !== false,
    });
    return res.status(201).json({ success: true, data: post, message: 'Post created successfully' });
  } catch (err) { next(err); }
}

async function updatePost(req, res, next) {
  try {
    const { id } = req.params;
    const post = await postService.getById(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (post.author_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only edit your own posts' });
    }
    const updated = await postService.update(id, post.agent_id, req.body);
    return res.status(200).json({ success: true, data: updated, message: 'Post updated successfully' });
  } catch (err) { next(err); }
}

async function deletePost(req, res, next) {
  try {
    const { id } = req.params;
    const post = await postService.getById(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (post.author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this post' });
    }
    await postService.remove(id, post.agent_id);
    return res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (err) { next(err); }
}

async function getPostById(req, res, next) {
  try {
    const { id } = req.params;
    const post = await postService.getById(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    return res.status(200).json({ success: true, data: post, message: 'Post retrieved successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  listAgentPosts,
  createPost,
  updatePost,
  deletePost,
  getPostById,
};
