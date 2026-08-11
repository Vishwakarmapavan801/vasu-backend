const svc = require('../services/monetizationService');

async function getFeaturedListings(req, res, next) {
  try { const result = await svc.getFeaturedListings(req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function createFeaturedListing(req, res, next) {
  try { const data = await svc.createFeaturedListing(req.agentId, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function deactivateFeaturedListing(req, res, next) {
  try { const data = await svc.deactivateFeaturedListing(req.params.id, req.agentId); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getFeaturedAgents(req, res, next) {
  try { const result = await svc.getFeaturedAgents(req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function createFeaturedAgent(req, res, next) {
  try { const data = await svc.createFeaturedAgent(req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function deactivateFeaturedAgent(req, res, next) {
  try { const data = await svc.deactivateFeaturedAgent(req.params.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getSubscriptionPlans(req, res, next) {
  try { const result = await svc.getSubscriptionPlans(req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function createSubscriptionPlan(req, res, next) {
  try { const data = await svc.createSubscriptionPlan(req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getAgentSubscriptions(req, res, next) {
  try { const data = await svc.getAgentSubscriptions(req.agentId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function createAgentSubscription(req, res, next) {
  try { const data = await svc.createAgentSubscription(req.agentId, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function cancelAgentSubscription(req, res, next) {
  try { const data = await svc.cancelAgentSubscription(req.params.id, req.agentId); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

module.exports = {
  getFeaturedListings, createFeaturedListing, deactivateFeaturedListing,
  getFeaturedAgents, createFeaturedAgent, deactivateFeaturedAgent,
  getSubscriptionPlans, createSubscriptionPlan,
  getAgentSubscriptions, createAgentSubscription, cancelAgentSubscription,
};
