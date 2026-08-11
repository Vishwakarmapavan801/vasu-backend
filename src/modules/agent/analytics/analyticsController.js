const agentService = require('../services/agentService');
const analyticsService = require('../services/analyticsService');

async function getOverview(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const overview = await analyticsService.getOverview(agent.id);
    return res.status(200).json({ success: true, data: overview });
  } catch (err) { next(err); }
}

async function getViewsAnalytics(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { period } = req.query;
    const data = await analyticsService.getViewsAnalytics(agent.id, period || '30d');
    return res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

async function getInquiryAnalytics(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { period } = req.query;
    const data = await analyticsService.getInquiryAnalytics(agent.id, period || '30d');
    return res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

async function getTourAnalytics(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { period } = req.query;
    const data = await analyticsService.getTourAnalytics(agent.id, period || '30d');
    return res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

async function getConversionAnalytics(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { period } = req.query;
    const data = await analyticsService.getConversionAnalytics(agent.id, period || '30d');
    return res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

async function getTopPerformers(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const data = await analyticsService.getTopPerformers(agent.id);
    return res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = {
  getOverview,
  getViewsAnalytics,
  getInquiryAnalytics,
  getTourAnalytics,
  getConversionAnalytics,
  getTopPerformers,
};
