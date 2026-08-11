const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

const router = Router();
const limiter = rateLimit({ windowMs: 15*60*1000, max: 100, skip: () => process.env.NODE_ENV !== 'production' });

router.use(requireAuth);
router.get('/', limiter, asyncHandler(controller.listNotifications));
router.get('/unread-count', limiter, asyncHandler(controller.getUnreadCount));
router.put('/:id/read', limiter, asyncHandler(controller.markNotificationRead));
router.put('/read-all', limiter, asyncHandler(controller.markAllNotificationsRead));
router.delete('/:id', limiter, asyncHandler(controller.deleteNotification));

module.exports = router;
