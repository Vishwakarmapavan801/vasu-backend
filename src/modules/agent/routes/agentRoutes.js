const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth, optionalAuth } = require('../../../middleware/auth');
const { requireAdmin } = require('../../../middleware/admin');
const agentController = require('../controllers/agentController');
const agentAuthController = require('../controllers/agentAuthController');
const reviewController = require('../controllers/reviewController');
const tourController = require('../controllers/tourController');
const postController = require('../controllers/postController');
const followerController = require('../controllers/followerController');
const dashboardController = require('../controllers/dashboardController');
const listingController = require('../controllers/listingController');
const analyticsController = require('../analytics/analyticsController');
const reviewResponseController = require('../controllers/reviewResponseController');
const myPostsController = require('../controllers/myPostsController');

const router = Router();

const isDev = process.env.NODE_ENV !== 'production';
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: isDev ? 1000 : 30 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: isDev ? 1000 : 100 });

// Public GET endpoints
router.get('/agents', publicLimiter, asyncHandler(agentController.listAgents));
router.get('/agents/:id', publicLimiter, asyncHandler(agentController.getAgentById));
router.get('/agents/:id/stats', publicLimiter, asyncHandler(agentController.getAgentStats));
router.get('/agents/:id/listings', publicLimiter, asyncHandler(agentController.getAgentListings));
router.get('/agents/:id/sold', publicLimiter, asyncHandler(agentController.getAgentSold));
router.get('/agents/:id/reviews', publicLimiter, asyncHandler(reviewController.getAgentReviews));
router.get('/agents/:id/posts', publicLimiter, asyncHandler(postController.listAgentPosts));
router.get('/agents/:id/followers', publicLimiter, asyncHandler(followerController.getFollowers));
router.get('/posts/:id', publicLimiter, asyncHandler(postController.getPostById));

// Registration (requires auth)
router.post('/agents/register', requireAuth, authLimiter, asyncHandler(agentController.registerAgent));

// Admin actions
router.post('/agents/:id/approve', requireAuth, requireAdmin, authLimiter, asyncHandler(agentController.approveAgent));
router.post('/agents/:id/reject', requireAuth, requireAdmin, authLimiter, asyncHandler(agentController.rejectAgent));

// Agent profile update
router.patch('/agents/:id', requireAuth, authLimiter, asyncHandler(agentController.updateAgent));

// Follow / unfollow
router.post('/agents/:id/follow', requireAuth, authLimiter, asyncHandler(followerController.followAgent));
router.delete('/agents/:id/follow', requireAuth, authLimiter, asyncHandler(followerController.unfollowAgent));

// Tour request (public with optional auth)
router.post('/agents/:id/request-tour', optionalAuth, publicLimiter, asyncHandler(tourController.requestTour));

// Review create
router.post('/agents/:id/review', requireAuth, authLimiter, asyncHandler(reviewController.createReview));

// Post create
router.post('/agents/:id/post', requireAuth, authLimiter, asyncHandler(postController.createPost));

// Review update / delete
router.patch('/reviews/:id', requireAuth, authLimiter, asyncHandler(reviewController.updateReview));
router.delete('/reviews/:id', requireAuth, authLimiter, asyncHandler(reviewController.deleteReview));

// Post update / delete
router.patch('/posts/:id', requireAuth, authLimiter, asyncHandler(postController.updatePost));
router.delete('/posts/:id', requireAuth, authLimiter, asyncHandler(postController.deletePost));

// ================================================================
// Agent Dashboard Routes
// ================================================================
router.get('/agent/dashboard', requireAuth, authLimiter, asyncHandler(dashboardController.getDashboard));
router.get('/agent/dashboard/analytics', requireAuth, authLimiter, asyncHandler(dashboardController.getDashboardAnalytics));

// Agent tours
router.get('/agent/tours', requireAuth, authLimiter, asyncHandler(tourController.listAgentTours));
router.patch('/agent/tours/:id', requireAuth, authLimiter, asyncHandler(tourController.updateTourStatus));

// ================================================================
// Agent My Listings Routes
// ================================================================
router.get('/agent/listings', requireAuth, authLimiter, asyncHandler(listingController.listMyListings));
router.get('/agent/listings/:listingKey', requireAuth, authLimiter, asyncHandler(listingController.getListingDetail));
router.patch('/agent/listings/:listingKey/meta', requireAuth, authLimiter, asyncHandler(listingController.updateListingMeta));
router.get('/agent/listings/:listingKey/meta', requireAuth, authLimiter, asyncHandler(listingController.getListingMeta));
router.delete('/agent/listings/:listingKey', requireAuth, authLimiter, asyncHandler(listingController.deleteListing));
router.get('/agent/listings/:listingKey/analytics', requireAuth, authLimiter, asyncHandler(listingController.getListingAnalytics));
router.get('/agent/listings/:listingKey/inquiries', requireAuth, authLimiter, asyncHandler(listingController.getListingInquiries));
router.get('/agent/listings/:listingKey/saved-count', requireAuth, authLimiter, asyncHandler(listingController.getListingSavedCount));
router.post('/agent/listings/:listingKey/view', optionalAuth, publicLimiter, asyncHandler(listingController.logListingView));

// ================================================================
// Agent Analytics Routes
// ================================================================
router.get('/agent/analytics/overview', requireAuth, authLimiter, asyncHandler(analyticsController.getOverview));
router.get('/agent/analytics/views', requireAuth, authLimiter, asyncHandler(analyticsController.getViewsAnalytics));
router.get('/agent/analytics/inquiries', requireAuth, authLimiter, asyncHandler(analyticsController.getInquiryAnalytics));
router.get('/agent/analytics/tours', requireAuth, authLimiter, asyncHandler(analyticsController.getTourAnalytics));
router.get('/agent/analytics/conversion', requireAuth, authLimiter, asyncHandler(analyticsController.getConversionAnalytics));
router.get('/agent/analytics/top-performers', requireAuth, authLimiter, asyncHandler(analyticsController.getTopPerformers));

// ================================================================
// Agent Review Response Routes
// ================================================================
router.get('/agent/review-responses', requireAuth, authLimiter, asyncHandler(reviewResponseController.getReviewResponses));
router.post('/agent/review-responses', requireAuth, authLimiter, asyncHandler(reviewResponseController.createReviewResponse));
router.patch('/agent/review-responses/:id', requireAuth, authLimiter, asyncHandler(reviewResponseController.updateReviewResponse));
router.delete('/agent/review-responses/:id', requireAuth, authLimiter, asyncHandler(reviewResponseController.deleteReviewResponse));

// ================================================================
// ================================================================
// Agent My-Profile Routes
// ================================================================
router.get('/agent/my-profile', requireAuth, authLimiter, asyncHandler(myPostsController.getMyProfile));

// ================================================================
// Agent Create Post Routes
// ================================================================
router.post('/agent/posts', requireAuth, authLimiter, asyncHandler(myPostsController.createPost));
router.get('/agent/my-posts', requireAuth, authLimiter, asyncHandler(myPostsController.listMyPosts));
router.patch('/agent/posts/:id', requireAuth, authLimiter, asyncHandler(myPostsController.updateMyPost));
router.delete('/agent/posts/:id', requireAuth, authLimiter, asyncHandler(myPostsController.deleteMyPost));

// ================================================================
// Agent MLS Listings (for dropdown)
// ================================================================
router.get('/agent/listings/mine', requireAuth, authLimiter, asyncHandler(myPostsController.getMyMlsListings));

// ================================================================
// Agent Create Account (from social flow)
// ================================================================
router.post('/agent/create', requireAuth, authLimiter, asyncHandler(myPostsController.createAgentAccount));

// Agent Auth Routes (public - no requireAuth)
// ================================================================
router.post('/agent/auth/register', publicLimiter, asyncHandler(agentAuthController.register));
router.post('/agent/auth/login', publicLimiter, asyncHandler(agentAuthController.login));
router.post('/agent/auth/dev-login', publicLimiter, asyncHandler(agentAuthController.devLogin));

module.exports = router;
