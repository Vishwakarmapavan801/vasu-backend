const ops = require('../services/operationsService');

// Inquiries
async function createInquiry(req, res, next) {
  try { const data = await ops.createInquiry({ ...req.body, user_id: req.user?.id }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getInquiries(req, res, next) {
  try { const result = await ops.getInquiries(req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function getInquiry(req, res, next) {
  try { const data = await ops.getInquiry(req.params.id); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Tours
async function createTourSchedule(req, res, next) {
  try { const data = await ops.createTourSchedule({ ...req.body, user_id: req.user?.id }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getTourSchedules(req, res, next) {
  try { const result = await ops.getTourSchedules(req.agentId, req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function updateTourSchedule(req, res, next) {
  try { const data = await ops.updateTourSchedule(req.params.id, req.agentId, req.body); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Offers
async function createOfferInquiry(req, res, next) {
  try { const data = await ops.createOfferInquiry({ ...req.body, user_id: req.user?.id }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getOfferInquiries(req, res, next) {
  try { const result = await ops.getOfferInquiries(req.agentId, req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function updateOfferInquiry(req, res, next) {
  try { const data = await ops.updateOfferInquiry(req.params.id, req.agentId, req.body); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Attribution
async function createAttribution(req, res, next) {
  try { const data = await ops.createAttribution(req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getAttribution(req, res, next) {
  try { const data = await ops.getAttribution(req.params.leadId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Transactions
async function createTransaction(req, res, next) {
  try { const data = await ops.createTransaction(req.agentId, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function getTransactions(req, res, next) {
  try { const result = await ops.getTransactions(req.agentId, req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}
async function getTransaction(req, res, next) {
  try { const data = await ops.getTransaction(req.params.id, req.agentId); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function updateTransaction(req, res, next) {
  try { const data = await ops.updateTransaction(req.params.id, req.agentId, req.body); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function deleteTransaction(req, res, next) {
  try { const ok = await ops.deleteTransaction(req.params.id, req.agentId); if (!ok) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, message: 'Deleted' }); }
  catch (err) { next(err); }
}

// Milestones
async function getMilestones(req, res, next) {
  try { const data = await ops.getMilestones(req.params.transactionId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function createMilestone(req, res, next) {
  try { const data = await ops.createMilestone(req.params.transactionId, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function updateMilestone(req, res, next) {
  try { const data = await ops.updateMilestone(req.params.id, req.body); if (!data) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Documents
async function getDocuments(req, res, next) {
  try { const data = await ops.getDocuments(req.params.transactionId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function createDocument(req, res, next) {
  try { const data = await ops.createDocument(req.params.transactionId, req.body, req.user.id); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}
async function deleteDocument(req, res, next) {
  try { const ok = await ops.deleteDocument(req.params.id); if (!ok) return res.status(404).json({ success: false, error: 'Not found' }); return res.status(200).json({ success: true, message: 'Deleted' }); }
  catch (err) { next(err); }
}

// Lead from inquiry
async function createLeadFromInquiry(req, res, next) {
  try { const data = await ops.createLeadFromInquiry(req.params.inquiryId); if (!data) return res.status(404).json({ success: false, error: 'Inquiry not found' }); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Dashboard
async function getOperationsDashboard(req, res, next) {
  try { const data = await ops.getOperationsDashboard(req.agentId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

module.exports = {
  createInquiry, getInquiries, getInquiry,
  createTourSchedule, getTourSchedules, updateTourSchedule,
  createOfferInquiry, getOfferInquiries, updateOfferInquiry,
  createAttribution, getAttribution,
  createTransaction, getTransactions, getTransaction, updateTransaction, deleteTransaction,
  getMilestones, createMilestone, updateMilestone,
  getDocuments, createDocument, deleteDocument,
  createLeadFromInquiry, getOperationsDashboard,
};
