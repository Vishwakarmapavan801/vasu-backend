const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth } = require('../../../middleware/auth');
const pool = require('../../../config/database');
const ctrl = require('../controllers/operationsController');

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: () => process.env.NODE_ENV !== 'production' });

async function resolveAgent(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id FROM agents WHERE user_id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    req.agentId = rows[0].id;
    next();
  } catch (err) { next(err); }
}

// Public endpoints (no auth required for submitting inquiries)
router.post('/operations/inquiries', limiter, asyncHandler(ctrl.createInquiry));
router.post('/operations/tours', limiter, asyncHandler(ctrl.createTourSchedule));
router.post('/operations/offers', limiter, asyncHandler(ctrl.createOfferInquiry));

// Agent-gated endpoints
router.get('/operations/inquiries', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getInquiries));
router.get('/operations/inquiries/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getInquiry));
router.get('/operations/tours', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getTourSchedules));
router.patch('/operations/tours/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.updateTourSchedule));
router.get('/operations/offers', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getOfferInquiries));
router.patch('/operations/offers/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.updateOfferInquiry));

// Attribution
router.post('/operations/attribution', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.createAttribution));
router.get('/operations/attribution/:leadId', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getAttribution));

// Transactions
router.get('/operations/transactions', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getTransactions));
router.post('/operations/transactions', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.createTransaction));
router.get('/operations/transactions/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getTransaction));
router.patch('/operations/transactions/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.updateTransaction));
router.delete('/operations/transactions/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.deleteTransaction));

// Milestones
router.get('/operations/transactions/:transactionId/milestones', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getMilestones));
router.post('/operations/transactions/:transactionId/milestones', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.createMilestone));
router.patch('/operations/milestones/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.updateMilestone));

// Documents
router.get('/operations/transactions/:transactionId/documents', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getDocuments));
router.post('/operations/transactions/:transactionId/documents', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.createDocument));
router.delete('/operations/documents/:id', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.deleteDocument));

// Lead conversion
router.post('/operations/inquiries/:inquiryId/convert', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.createLeadFromInquiry));

// Dashboard
router.get('/operations/dashboard', requireAuth, resolveAgent, limiter, asyncHandler(ctrl.getOperationsDashboard));

module.exports = router;
