const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth, optionalAuth } = require('../../../middleware/auth');
const ctrl = require('../controllers/socialController');

const router = Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, skip: () => process.env.NODE_ENV !== 'production' });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: () => process.env.NODE_ENV !== 'production' });

// --- Feed & Explore ---
router.get('/feed', optionalAuth, publicLimiter, asyncHandler(ctrl.getFeed));
router.get('/explore', optionalAuth, publicLimiter, asyncHandler(ctrl.getExplore));
router.get('/reels', optionalAuth, publicLimiter, asyncHandler(ctrl.getReels));
router.get('/trending', publicLimiter, asyncHandler(ctrl.getTrending));

// --- Search ---
router.get('/social/search', publicLimiter, asyncHandler(ctrl.searchPosts));
router.get('/social/hashtags/trending', publicLimiter, asyncHandler(ctrl.getTrendingHashtags));
router.get('/social/hashtag', publicLimiter, asyncHandler(ctrl.searchByHashtag));

// --- Posts (CRUD) ---
router.get('/social/posts/:id', optionalAuth, publicLimiter, asyncHandler(ctrl.getPost));
router.post('/agent/posts', requireAuth, authLimiter, asyncHandler(ctrl.createPost));
router.patch('/agent/posts/:id', requireAuth, authLimiter, asyncHandler(ctrl.updatePost));
router.delete('/agent/posts/:id', requireAuth, authLimiter, asyncHandler(ctrl.deletePost));
router.get('/agent/my-posts', requireAuth, authLimiter, asyncHandler(ctrl.getMyPosts));

// --- Agent public posts ---
router.get('/agents/:agentId/posts', publicLimiter, asyncHandler(ctrl.getAgentPosts));

// --- Likes ---
router.post('/social/posts/:id/like', requireAuth, authLimiter, asyncHandler(ctrl.likePost));
router.delete('/social/posts/:id/like', requireAuth, authLimiter, asyncHandler(ctrl.unlikePost));

// --- Comments ---
router.get('/social/posts/:id/comments', publicLimiter, asyncHandler(ctrl.getComments));
router.post('/social/posts/:id/comment', requireAuth, authLimiter, asyncHandler(ctrl.addComment));
router.patch('/social/comments/:commentId', requireAuth, authLimiter, asyncHandler(ctrl.updateComment));
router.delete('/social/comments/:commentId', requireAuth, authLimiter, asyncHandler(ctrl.deleteComment));
router.post('/social/comments/:commentId/like', requireAuth, authLimiter, asyncHandler(ctrl.likeComment));
router.delete('/social/comments/:commentId/like', requireAuth, authLimiter, asyncHandler(ctrl.unlikeComment));

// --- Saves ---
router.post('/social/posts/:id/save', requireAuth, authLimiter, asyncHandler(ctrl.savePost));
router.delete('/social/posts/:id/save', requireAuth, authLimiter, asyncHandler(ctrl.unsavePost));
router.get('/social/saved', requireAuth, authLimiter, asyncHandler(ctrl.getSavedPosts));

// --- Follows ---
router.post('/social/agents/:agentId/follow', requireAuth, authLimiter, asyncHandler(ctrl.followAgent));
router.delete('/social/agents/:agentId/follow', requireAuth, authLimiter, asyncHandler(ctrl.unfollowAgent));
router.get('/social/agents/:agentId/followers', publicLimiter, asyncHandler(ctrl.getFollowersList));
router.get('/social/agents/:agentId/follower-count', publicLimiter, asyncHandler(ctrl.getFollowerCount));
router.get('/social/following', requireAuth, authLimiter, asyncHandler(ctrl.getFollowingList));
router.get('/social/following-count', requireAuth, authLimiter, asyncHandler(ctrl.getFollowingCount));
router.get('/social/agents/:agentId/is-following', optionalAuth, publicLimiter, asyncHandler(ctrl.checkFollowing));

// --- Notifications ---
router.get('/social/notifications', requireAuth, authLimiter, asyncHandler(ctrl.getNotifications));
router.get('/social/notifications/unread-count', requireAuth, authLimiter, asyncHandler(ctrl.getUnreadCount));
router.patch('/social/notifications/:id/read', requireAuth, authLimiter, asyncHandler(ctrl.markNotificationRead));
router.patch('/social/notifications/read-all', requireAuth, authLimiter, asyncHandler(ctrl.markAllNotificationsRead));

// --- Stories ---
router.post('/agent/stories', requireAuth, authLimiter, asyncHandler(ctrl.createStory));
router.get('/social/stories', optionalAuth, publicLimiter, asyncHandler(ctrl.getActiveStories));
router.post('/social/stories/:id/view', optionalAuth, publicLimiter, asyncHandler(ctrl.viewStory));

// --- Share ---
router.post('/social/posts/:id/share', optionalAuth, publicLimiter, asyncHandler(ctrl.sharePost));

// --- Recommended Agents ---
router.get('/social/recommended-agents', optionalAuth, publicLimiter, asyncHandler(ctrl.getRecommendedAgents));

// --- Agent Account Creation ---
router.post('/agent/create', requireAuth, authLimiter, asyncHandler(ctrl.createAgentAccount));

module.exports = router;
