const agentService = require('../services/agentService');
const dashboardService = require('../services/dashboardService');

async function getDashboard(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    const dashboard = await dashboardService.getDashboard(agent.id, req.user.id);
    return res.status(200).json({ success: true, data: dashboard, message: 'Dashboard retrieved successfully' });
  } catch (err) { next(err); }
}

async function getDashboardAnalytics(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent profile not found' });
    }
    const { period } = req.query;
    const analytics = await dashboardService.getDashboardAnalytics(agent.id, period || '30d');
    return res.status(200).json({ success: true, data: analytics, message: 'Analytics retrieved successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  getDashboard,
  getDashboardAnalytics,
};
