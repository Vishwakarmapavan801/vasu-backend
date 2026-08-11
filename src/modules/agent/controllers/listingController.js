const listingService = require('../services/listingService');

async function listMyListings(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { page, limit, status, sort, order, search } = req.query;
    const result = await listingService.listMyListings(agent.id, agent.license_number, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      status, sort, order, search,
    });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination, message: 'Listings retrieved successfully' });
  } catch (err) { next(err); }
}

async function getListingDetail(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    const listing = await listingService.getListingDetail(agent.id, listingKey);
    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    return res.status(200).json({ success: true, data: listing, message: 'Listing retrieved successfully' });
  } catch (err) { next(err); }
}

async function updateListingMeta(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    const meta = await listingService.updateListingMeta(agent.id, listingKey, req.body);
    return res.status(200).json({ success: true, data: meta, message: 'Listing metadata updated successfully' });
  } catch (err) { next(err); }
}

async function getListingMeta(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    const meta = await listingService.getListingMeta(agent.id, listingKey);
    return res.status(200).json({ success: true, data: meta || {}, message: 'Listing metadata retrieved successfully' });
  } catch (err) { next(err); }
}

async function deleteListing(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    await listingService.deleteListing(agent.id, listingKey);
    return res.status(200).json({ success: true, message: 'Listing removed successfully' });
  } catch (err) { next(err); }
}

async function getListingAnalytics(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    const analytics = await listingService.getListingAnalytics(agent.id, listingKey);
    return res.status(200).json({ success: true, data: analytics, message: 'Listing analytics retrieved successfully' });
  } catch (err) { next(err); }
}

async function getListingInquiries(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    const { page, limit } = req.query;
    const result = await listingService.getListingInquiries(agent.id, listingKey, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
    });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination, message: 'Inquiries retrieved successfully' });
  } catch (err) { next(err); }
}

async function getListingSavedCount(req, res, next) {
  try {
    const agent = await require('../services/agentService').getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { listingKey } = req.params;
    const count = await listingService.getListingSavedCount(listingKey);
    return res.status(200).json({ success: true, data: { saved_count: count }, message: 'Saved count retrieved successfully' });
  } catch (err) { next(err); }
}

async function logListingView(req, res, next) {
  try {
    const { listingKey } = req.params;
    const { agentId } = req.body;
    if (agentId) {
      await listingService.logListingView(agentId, listingKey, req.user?.id || null, req.ip);
    }
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

module.exports = {
  listMyListings,
  getListingDetail,
  updateListingMeta,
  getListingMeta,
  deleteListing,
  getListingAnalytics,
  getListingInquiries,
  getListingSavedCount,
  logListingView,
};
