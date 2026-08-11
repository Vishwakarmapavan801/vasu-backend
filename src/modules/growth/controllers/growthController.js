const svc = require('../services/growthService');

async function getSuggestedAgents(req, res, next) {
  try { const result = await svc.getSuggestedAgents(req.user.id, req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function createSuggestedAgent(req, res, next) {
  try { const data = await svc.createSuggestedAgent(req.user.id, req.body.agent_id, req.body.score, req.body.reason); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function dismissSuggestedAgent(req, res, next) {
  try { const data = await svc.dismissSuggestedAgent(req.user.id, req.params.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function clickSuggestedAgent(req, res, next) {
  try { const data = await svc.clickSuggestedAgent(req.user.id, req.params.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getSuggestedListings(req, res, next) {
  try { const result = await svc.getSuggestedListings(req.user.id, req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function createSuggestedListing(req, res, next) {
  try { const data = await svc.createSuggestedListing(req.user.id, req.body.listing_key, req.body.score, req.body.reason); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function dismissSuggestedListing(req, res, next) {
  try { const data = await svc.dismissSuggestedListing(req.user.id, req.params.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getFeedScores(req, res, next) {
  try { const result = await svc.getFeedScores(req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function computeFeedScores(req, res, next) {
  try { const result = await svc.computeFeedScores(req.body.postId, req.body.score, req.body.signals); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}

module.exports = {
  getSuggestedAgents, createSuggestedAgent, dismissSuggestedAgent, clickSuggestedAgent,
  getSuggestedListings, createSuggestedListing, dismissSuggestedListing,
  getFeedScores, computeFeedScores,
};
