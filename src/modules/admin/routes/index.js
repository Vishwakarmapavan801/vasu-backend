const express = require('express');

const { requireAuth, requireRole } = require('../../../middleware/admin');

const adminAuthController = require('../controllers/adminAuthController');
const adminStatsController = require('../controllers/adminStatsController');
const listingAdminController = require('../controllers/listingAdminController');
const agentAdminController = require('../controllers/agentAdminController');
const usersAdminController = require('../controllers/usersAdminController');
const mlsAdminController = require('../controllers/mlsAdminController');
const postsAdminController = require('../controllers/postsAdminController');
const leadsAdminController = require('../controllers/leadsAdminController');
const transactionsAdminController = require('../controllers/transactionsAdminController');
const mediaAdminController = require('../controllers/mediaAdminController');
const settingsAdminController = require('../controllers/settingsAdminController');
const auditAdminController = require('../controllers/auditAdminController');
const blogAdminRoutes = require('../../blog/routes/blogAdminRoutes');

const router = express.Router();

// Every route below is auth-gated (requireAuth) AND role-gated (requireRole).
// Permissions map to ROLE_PERMISSIONS in middleware/admin.js.

// Admin auth (login/logout/refresh are token-gated; 'me' requires an admin token)
router.post('/auth/login', adminAuthController.login);
router.post('/auth/refresh', adminAuthController.refresh);
router.post('/auth/logout', adminAuthController.logout);
router.get('/auth/me', requireAuth, requireRole('dashboard'), adminAuthController.me);

// Dashboard
router.get('/dashboard', requireAuth, requireRole('dashboard'), adminStatsController.getDashboard);
router.get('/listing-counts', requireAuth, requireRole('dashboard'), adminStatsController.getListingCounts);

// Listings (MLS)
router.get('/listings', requireAuth, requireRole('listings'), listingAdminController.search);
router.get('/listings/:listingKey', requireAuth, requireRole('listings'), listingAdminController.getDetail);
router.patch('/listings/:listingKey/featured', requireAuth, requireRole('listings'), listingAdminController.setFeatured);
router.patch('/listings/:listingKey/archive', requireAuth, requireRole('listings'), listingAdminController.setArchived);
router.post('/listings/:listingKey/refresh-photos', requireAuth, requireRole('listings'), listingAdminController.refreshPhotos);

// Agents
router.get('/agents', requireAuth, requireRole('agents'), agentAdminController.list);
router.get('/agents/:id', requireAuth, requireRole('agents'), agentAdminController.getById);
router.get('/agents/:id/listings', requireAuth, requireRole('agents'), agentAdminController.getListings);
router.get('/agents/:id/sold', requireAuth, requireRole('agents'), agentAdminController.getSoldListings);
router.patch('/agents/:id/approve', requireAuth, requireRole('agents'), agentAdminController.approve);
router.patch('/agents/:id/reject', requireAuth, requireRole('agents'), agentAdminController.reject);
router.patch('/agents/:id/suspend', requireAuth, requireRole('agents'), agentAdminController.suspend);
router.patch('/agents/:id/reactivate', requireAuth, requireRole('agents'), agentAdminController.reactivate);
router.patch('/agents/:id/verify', requireAuth, requireRole('agents'), agentAdminController.verify);
router.patch('/agents/:id/featured', requireAuth, requireRole('agents'), agentAdminController.feature);
router.patch('/agents/:id/reset-password', requireAuth, requireRole('agents'), agentAdminController.resetPassword);
router.delete('/agents/:id', requireAuth, requireRole('agents'), agentAdminController.remove);

// Users
router.get('/users/roles', requireAuth, requireRole('roles'), usersAdminController.roleSummary);
router.get('/users', requireAuth, requireRole('users'), usersAdminController.list);
router.get('/users/:id', requireAuth, requireRole('users'), usersAdminController.getById);
router.patch('/users/:id/status', requireAuth, requireRole('users'), usersAdminController.updateStatus);
router.patch('/users/:id/role', requireAuth, requireRole('roles'), usersAdminController.updateRole);
router.patch('/users/:id/reset-password', requireAuth, requireRole('users'), usersAdminController.resetPassword);

// MLS (sync + data quality)
router.get('/mls/status', requireAuth, requireRole('mls'), mlsAdminController.getStatus);
router.post('/mls/sync', requireAuth, requireRole('mls'), mlsAdminController.triggerSync);
router.get('/mls/quality', requireAuth, requireRole('mls'), mlsAdminController.getQuality);
router.delete('/mls/errors/:errorId', requireAuth, requireRole('mls'), mlsAdminController.clearError);

// Posts moderation
router.get('/posts', requireAuth, requireRole('posts'), postsAdminController.list);
router.get('/posts/:id', requireAuth, requireRole('posts'), postsAdminController.getById);
router.patch('/posts/:id/visibility', requireAuth, requireRole('posts'), postsAdminController.moderate);
router.delete('/posts/:id', requireAuth, requireRole('posts'), postsAdminController.remove);

// Leads (CRM)
router.get('/leads', requireAuth, requireRole('leads'), leadsAdminController.list);
router.get('/leads/:id', requireAuth, requireRole('leads'), leadsAdminController.getById);
router.patch('/leads/:id/status', requireAuth, requireRole('leads'), leadsAdminController.updateStatus);
router.patch('/leads/:id/reassign', requireAuth, requireRole('leads'), leadsAdminController.reassign);

// Transactions (closing workflow)
router.get('/transactions', requireAuth, requireRole('transactions'), transactionsAdminController.list);
router.get('/transactions/:id', requireAuth, requireRole('transactions'), transactionsAdminController.getById);
router.patch('/transactions/:id/status', requireAuth, requireRole('transactions'), transactionsAdminController.updateStatus);
router.post('/transactions/:id/milestones', requireAuth, requireRole('transactions'), transactionsAdminController.addMilestone);
router.patch('/transactions/milestones/:milestoneId', requireAuth, requireRole('transactions'), transactionsAdminController.updateMilestone);
router.delete('/transactions/milestones/:milestoneId', requireAuth, requireRole('transactions'), transactionsAdminController.deleteMilestone);

// Media
router.get('/media', requireAuth, requireRole('media'), mediaAdminController.getOverview);
router.get('/media/:mediaKey', requireAuth, requireRole('media'), mediaAdminController.getMedia);
router.post('/media/:mediaKey/refresh', requireAuth, requireRole('media'), mediaAdminController.refreshMedia);

// Settings
router.get('/settings', requireAuth, requireRole('settings'), settingsAdminController.getSettings);
router.put('/settings', requireAuth, requireRole('settings'), settingsAdminController.setSetting);
router.delete('/settings/:key', requireAuth, requireRole('settings'), settingsAdminController.deleteSetting);

// Audit logs
router.get('/logs', requireAuth, requireRole('logs'), auditAdminController.getLogs);
router.get('/audit', requireAuth, requireRole('logs'), auditAdminController.getLogs);

// AI Blog Manager (generate/approve/publish/CRUD + generation jobs).
// The blogAdminRoutes router applies its own requireAuth + requireRole('posts').
router.use('/blog', blogAdminRoutes);

module.exports = router;
