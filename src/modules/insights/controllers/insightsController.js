const insightsService = require('../services/insightsService');

// Comparisons
async function getComparisons(req, res, next) {
  try { const data = await insightsService.getComparisons(req.user.id); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getComparison(req, res, next) {
  try { const data = await insightsService.getComparison(req.params.id, req.user.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function createComparison(req, res, next) {
  try { const data = await insightsService.createComparison(req.user.id, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function updateComparison(req, res, next) {
  try { const data = await insightsService.updateComparison(req.params.id, req.user.id, req.body); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function deleteComparison(req, res, next) {
  try { const ok = await insightsService.deleteComparison(req.params.id, req.user.id); if (!ok) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, message: 'Deleted' }); }
  catch (err) { next(err); }
}

// Mortgage
async function calculateMortgage(req, res, next) {
  try { const result = await insightsService.calculateMortgage(req.body); return res.status(200).json({ success: true, data: result }); }
  catch (err) { next(err); }
}
async function saveMortgage(req, res, next) {
  try { const result = await insightsService.calculateMortgage(req.body); const saved = req.user ? await insightsService.saveMortgageRequest(req.user.id, req.body, result) : null; return res.status(200).json({ success: true, data: result, saved }); }
  catch (err) { next(err); }
}

// AI
async function saveAIRecommendation(req, res, next) {
  try { const data = await insightsService.saveAIRecommendation(req.user.id, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getAIRecommendations(req, res, next) {
  try { const data = await insightsService.getAIRecommendations(req.user.id, req.query.type, parseInt(req.query.limit) || 20); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function saveMarketReport(req, res, next) {
  try { const data = await insightsService.saveMarketReport({ ...req.body, generated_for: req.user?.id }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getMarketReports(req, res, next) {
  try { const data = await insightsService.getMarketReports(req.params.location, req.query.type || 'city', parseInt(req.query.limit) || 10); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Analytics Events
async function trackEvent(req, res, next) {
  try { const data = await insightsService.trackEvent({ ...req.body, user_id: req.user?.id, ip_address: req.ip }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getAnalytics(req, res, next) {
  try { const data = await insightsService.getAnalytics(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getListingAnalytics(req, res, next) {
  try { const data = await insightsService.getListingAnalytics(req.params.listingKey); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Listing Metadata
async function getListingMeta(req, res, next) {
  try { const data = await insightsService.getListingMeta(req.params.listingKey); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function upsertListingMeta(req, res, next) {
  try { const data = await insightsService.upsertListingMeta(req.params.listingKey, req.agentId, req.body); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Feed Events
async function getFeedEvents(req, res, next) {
  try { const data = await insightsService.getFeedEvents(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function createFeedEvent(req, res, next) {
  try { const data = await insightsService.createFeedEvent({ ...req.body, agent_id: req.agentId }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Open Houses
async function getOpenHouses(req, res, next) {
  try { const data = await insightsService.getOpenHouses(req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function createOpenHouse(req, res, next) {
  try { const data = await insightsService.createOpenHouse({ ...req.body, agent_id: req.agentId }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

// AI Investment Scores
async function getInvestmentScore(req, res, next) {
  try { const data = await insightsService.getInvestmentScore(req.params.listingKey); if (!data) return res.status(404).json({ success: false, error: 'Not computed yet' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function upsertInvestmentScore(req, res, next) {
  try { const data = await insightsService.upsertInvestmentScore(req.body); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// AI Rental Estimates
async function getRentalEstimate(req, res, next) {
  try { const data = await insightsService.getRentalEstimate(req.params.listingKey); if (!data) return res.status(404).json({ success: false, error: 'Not computed yet' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function upsertRentalEstimate(req, res, next) {
  try { const data = await insightsService.upsertRentalEstimate(req.body); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Analytics Daily
async function getAnalyticsDaily(req, res, next) {
  try { const data = await insightsService.getAnalyticsDaily(req.agentId, req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function upsertAnalyticsDaily(req, res, next) {
  try { const data = await insightsService.upsertAnalyticsDaily(req.body); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

module.exports = { getComparisons, getComparison, createComparison, updateComparison, deleteComparison, calculateMortgage, saveMortgage, saveAIRecommendation, getAIRecommendations, saveMarketReport, getMarketReports, trackEvent, getAnalytics, getListingAnalytics, getListingMeta, upsertListingMeta, getFeedEvents, createFeedEvent, getOpenHouses, createOpenHouse, getInvestmentScore, upsertInvestmentScore, getRentalEstimate, upsertRentalEstimate, getAnalyticsDaily, upsertAnalyticsDaily };
