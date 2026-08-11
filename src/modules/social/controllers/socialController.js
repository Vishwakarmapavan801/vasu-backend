const socialService = require('../services/socialService');
const feedService = require('../services/feedService');
const notificationService = require('../services/notificationService');

// --- Post CRUD ---
async function createPost(req, res, next) {
  try {
    const agent = await socialService.getAgentByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const post = await socialService.createPost(agent.id, req.body);
    return res.status(201).json({ success: true, data: post, message: 'Post created successfully' });
  } catch (err) { next(err); }
}

async function updatePost(req, res, next) {
  try {
    const agent = await socialService.getAgentByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const post = await socialService.updatePost(req.params.id, agent.id, req.body);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found or unauthorized' });
    return res.status(200).json({ success: true, data: post, message: 'Post updated successfully' });
  } catch (err) { next(err); }
}

async function deletePost(req, res, next) {
  try {
    const agent = await socialService.getAgentByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const deleted = await socialService.deletePost(req.params.id, agent.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Post not found or unauthorized' });
    return res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (err) { next(err); }
}

async function getPost(req, res, next) {
  try {
    const post = await socialService.getPostById(req.params.id, req.user?.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    return res.status(200).json({ success: true, data: post });
  } catch (err) { next(err); }
}

async function getAgentPosts(req, res, next) {
  try {
    const { agentId } = req.params;
    const result = await socialService.getAgentPosts(agentId, req.query);
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) { next(err); }
}

// --- Likes ---
async function likePost(req, res, next) {
  try {
    const result = await socialService.likePost(req.params.id, req.user.id);
    const post = await socialService.getPostById(req.params.id, req.user.id);
    if (post) notificationService.notifyPostOwner(post, req.user.id, 'like');
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function unlikePost(req, res, next) {
  try {
    const result = await socialService.unlikePost(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// --- Comments ---
async function addComment(req, res, next) {
  try {
    const comment = await socialService.addComment(req.params.id, req.user.id, req.body);
    const post = await socialService.getPostById(req.params.id, req.user.id);
    if (post) notificationService.notifyPostOwner(post, req.user.id, 'comment', comment.id);
    return res.status(201).json({ success: true, data: comment, message: 'Comment added successfully' });
  } catch (err) { next(err); }
}

async function getComments(req, res, next) {
  try {
    const result = await socialService.getComments(req.params.id, req.query);
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) { next(err); }
}

async function updateComment(req, res, next) {
  try {
    const comment = await socialService.updateComment(req.params.commentId, req.user.id, req.body.content);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found or unauthorized' });
    return res.status(200).json({ success: true, data: comment, message: 'Comment updated successfully' });
  } catch (err) { next(err); }
}

async function deleteComment(req, res, next) {
  try {
    const deleted = await socialService.deleteComment(req.params.commentId, req.user.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Comment not found or unauthorized' });
    return res.status(200).json({ success: true, message: 'Comment deleted successfully' });
  } catch (err) { next(err); }
}

async function likeComment(req, res, next) {
  try {
    const result = await socialService.likeComment(req.params.commentId, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function unlikeComment(req, res, next) {
  try {
    const result = await socialService.unlikeComment(req.params.commentId, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// --- Saves ---
async function savePost(req, res, next) {
  try {
    const result = await socialService.savePost(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function unsavePost(req, res, next) {
  try {
    const result = await socialService.unsavePost(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function getSavedPosts(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await socialService.getSavedPosts(req.user.id, parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) { next(err); }
}

// --- Follows ---
async function followAgent(req, res, next) {
  try {
    const { agentId } = req.params;
    const result = await socialService.follow(req.user.id, 'agent', agentId);
    const agentUser = await notificationService.getUserByAgentId(agentId);
    if (agentUser) notificationService.notifyFollow(agentUser.user_id, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function unfollowAgent(req, res, next) {
  try {
    const { agentId } = req.params;
    const result = await socialService.unfollow(req.user.id, 'agent', agentId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function getFollowerCount(req, res, next) {
  try {
    const count = await socialService.getFollowerCount('agent', req.params.agentId);
    return res.status(200).json({ success: true, data: { count } });
  } catch (err) { next(err); }
}

async function getFollowingCount(req, res, next) {
  try {
    const count = await socialService.getFollowingCount(req.user?.id);
    return res.status(200).json({ success: true, data: { count } });
  } catch (err) { next(err); }
}

async function getFollowersList(req, res, next) {
  try {
    const { page, limit } = req.query;
    const followers = await socialService.getFollowers('agent', req.params.agentId, parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: followers });
  } catch (err) { next(err); }
}

async function getFollowingList(req, res, next) {
  try {
    const { page, limit } = req.query;
    const following = await socialService.getFollowing(req.user.id, parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: following });
  } catch (err) { next(err); }
}

// --- Feed ---
async function getFeed(req, res, next) {
  try {
    const { page, limit } = req.query;
    const posts = await feedService.getFeed(req.user?.id, parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: posts });
  } catch (err) { next(err); }
}

async function getExplore(req, res, next) {
  try {
    const { page, limit } = req.query;
    const posts = await feedService.getExploreContent(parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: posts });
  } catch (err) { next(err); }
}

async function getReels(req, res, next) {
  try {
    const { page, limit } = req.query;
    const reels = await feedService.getReelsFeed(parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: reels });
  } catch (err) { next(err); }
}

async function getTrending(req, res, next) {
  try {
    const posts = await socialService.getTrendingPosts(parseInt(req.query.limit) || 20);
    return res.status(200).json({ success: true, data: posts });
  } catch (err) { next(err); }
}

// --- Search ---
async function searchPosts(req, res, next) {
  try {
    const { q, page, limit } = req.query;
    if (!q) return res.status(400).json({ success: false, error: 'Search query is required' });
    const posts = await socialService.searchPosts(q, { page: parseInt(page) || 1, limit: Math.min(parseInt(limit) || 20, 50) });
    return res.status(200).json({ success: true, data: posts });
  } catch (err) { next(err); }
}

async function searchByHashtag(req, res, next) {
  try {
    const { hashtag, page, limit } = req.query;
    if (!hashtag) return res.status(400).json({ success: false, error: 'Hashtag is required' });
    const posts = await feedService.searchByHashtag(hashtag, parseInt(page) || 1, Math.min(parseInt(limit) || 20, 50));
    return res.status(200).json({ success: true, data: posts });
  } catch (err) { next(err); }
}

async function getTrendingHashtags(req, res, next) {
  try {
    const hashtags = await feedService.getTrendingHashtags(parseInt(req.query.limit) || 20);
    return res.status(200).json({ success: true, data: hashtags });
  } catch (err) { next(err); }
}

// --- Notifications ---
async function getNotifications(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await notificationService.getNotifications(req.user.id, parseInt(page) || 1, Math.min(parseInt(limit) || 50, 100));
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) { next(err); }
}

async function markNotificationRead(req, res, next) {
  try {
    await notificationService.markAsRead(req.params.id, req.user.id);
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await notificationService.markAllAsRead(req.user.id);
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    return res.status(200).json({ success: true, data: { count } });
  } catch (err) { next(err); }
}

// --- Stories ---
async function createStory(req, res, next) {
  try {
    const agent = await socialService.getAgentByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const story = await socialService.createStory(agent.id, req.body);
    return res.status(201).json({ success: true, data: story });
  } catch (err) { next(err); }
}

async function getActiveStories(req, res, next) {
  try {
    const followedIds = await feedService.getFollowedAgentIds(req.user?.id);
    const stories = await socialService.getActiveStories(followedIds.length > 0 ? followedIds : []);
    return res.status(200).json({ success: true, data: stories });
  } catch (err) { next(err); }
}

async function viewStory(req, res, next) {
  try {
    await socialService.viewStory(req.params.id, req.user?.id);
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

// --- Share ---
async function sharePost(req, res, next) {
  try {
    await socialService.incrementShareCount(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

// --- Recommended Agents ---
async function getRecommendedAgents(req, res, next) {
  try {
    const agents = await feedService.getRecommendedAgents(req.user?.id, parseInt(req.query.limit) || 10);
    return res.status(200).json({ success: true, data: agents });
  } catch (err) { next(err); }
}

// --- Agent Account Creation ---
async function createAgentAccount(req, res, next) {
  try {
    const agent = await socialService.createAgentAccount(req.user.id, req.body);
    return res.status(201).json({ success: true, data: agent, message: 'Agent account created successfully' });
  } catch (err) { next(err); }
}

// --- Check is_following for a given agent ---
async function checkFollowing(req, res, next) {
  try {
    const following = await socialService.isFollowing(req.user?.id, 'agent', req.params.agentId);
    return res.status(200).json({ success: true, data: { following } });
  } catch (err) { next(err); }
}

// --- My Agent Posts (own agent's posts) ---
async function getMyPosts(req, res, next) {
  try {
    const agent = await socialService.getAgentByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const result = await socialService.getAgentPosts(agent.id, { ...req.query, all: 'true' });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (err) { next(err); }
}

module.exports = {
  createPost, updatePost, deletePost, getPost, getAgentPosts, getMyPosts,
  likePost, unlikePost,
  addComment, getComments, updateComment, deleteComment, likeComment, unlikeComment,
  savePost, unsavePost, getSavedPosts,
  followAgent, unfollowAgent, getFollowerCount, getFollowingCount, getFollowersList, getFollowingList, checkFollowing,
  getFeed, getExplore, getReels, getTrending,
  searchPosts, searchByHashtag, getTrendingHashtags,
  getNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount,
  createStory, getActiveStories, viewStory,
  sharePost, getRecommendedAgents, createAgentAccount,
};
