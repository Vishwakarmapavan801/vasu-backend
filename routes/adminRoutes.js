/**
 * Admin Routes
 *
 * All routes under /api/admin/...
 * Protected routes restricted to admin role.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(protect, authorize('admin'));

router.get('/dashboard', adminController.getDashboardStats);
router.get('/properties', adminController.getRecentProperties);
router.get('/users', adminController.getRecentUsers);
router.get('/inquiries', adminController.getRecentInquiries);
router.put('/users/:id/role', adminController.updateUserRole);
router.put('/users/:id/toggle-status', adminController.toggleUserStatus);
router.put('/properties/:id/featured', adminController.togglePropertyFeatured);

module.exports = router;
