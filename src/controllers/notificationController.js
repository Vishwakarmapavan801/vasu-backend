const notificationService = require('../services/notificationService');

function badRequest(res, message) {
  return res.status(400).json({ success: false, error: message });
}

async function listNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await notificationService.findByUserId(userId, req.query);
    return res.status(200).json({ success: true, data: result.notifications, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const userId = req.user.id;
    const count = await notificationService.getUnreadCount(userId);
    return res.status(200).json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const notification = await notificationService.markRead(id, userId);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found.' });
    }
    return res.status(200).json({ success: true, message: 'Notification marked as read.', data: notification });
  } catch (err) {
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    const userId = req.user.id;
    await notificationService.markAllRead(userId);
    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}

async function deleteNotification(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await notificationService.remove(id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Notification not found.' });
    }
    return res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, deleteNotification };
