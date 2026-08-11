const pool = require('../config/database');
const activityLogService = require('../services/activityLogService');

async function getDashboard(req, res, next) {
  try {
    const userId = req.user.id;

    const [favResult, notifResult, searchResult, toursResult, inquiriesResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM favorites WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE', [userId]),
      pool.query('SELECT COUNT(*)::int AS count FROM saved_searches WHERE user_id = $1 AND is_active = TRUE', [userId]),
      pool.query('SELECT COUNT(*)::int AS count FROM tour_requests WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*)::int AS count FROM property_agent_inquiries WHERE user_id = $1', [userId]),
    ]);

    const activityResult = await activityLogService.findByUserId(userId, { limit: 10 });

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalFavorites: favResult.rows[0].count,
          unreadNotifications: notifResult.rows[0].count,
          activeSearches: searchResult.rows[0].count,
          totalTours: toursResult.rows[0].count,
          totalInquiries: inquiriesResult.rows[0].count,
        },
        recentActivity: activityResult.activities,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
