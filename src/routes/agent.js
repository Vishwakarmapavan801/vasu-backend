const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const agentController = require('../controllers/agentController');
const reviewController = require('../controllers/reviewController');
const pool = require('../config/database');

const router = Router();

async function verifyAgentOwnership(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT user_id FROM agents WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    if (rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You do not own this agent profile' });
    }
    next();
  } catch (err) { next(err); }
}

router.get('/agents', asyncHandler(agentController.searchAgents));
router.get('/agents/member/:memberId', asyncHandler(agentController.getAgentByMlsId));
router.get('/agents/:id', asyncHandler(agentController.getAgentById));
router.put('/agents/profile', requireAuth, asyncHandler(agentController.upsertAgent));
router.patch('/agents/:id', requireAuth, verifyAgentOwnership, asyncHandler(agentController.updateAgent));

router.get('/agents/:agentId/reviews', asyncHandler(reviewController.getAgentReviews));
router.post('/agents/reviews', asyncHandler(reviewController.createReview));
router.post('/agents/reviews/:id/helpful', asyncHandler(reviewController.markReviewHelpful));
router.patch('/agents/reviews/:id/moderate', requireAuth, asyncHandler(reviewController.moderateReview));

module.exports = router;
