const reviewService = require('../services/reviewService');

async function getAgentReviews(req, res, next) {
  try {
    const { agentId } = req.params;
    const { page, limit, sort, order, rating, status } = req.query;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'Agent ID is required' });
    }
    const result = await reviewService.findByAgentId(agentId, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 10, 50),
      sort, order, rating, status,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createReview(req, res, next) {
  try {
    const { agent_id, reviewer_name, reviewer_email, rating, title, review, verified_purchase } = req.body;
    const errors = {};
    if (!agent_id) errors.agent_id = 'Agent ID is required';
    if (!reviewer_name || !reviewer_name.trim()) errors.reviewer_name = 'Reviewer name is required';
    if (!rating || rating < 1 || rating > 5) errors.rating = 'Rating must be between 1 and 5';
    if (!review || !review.trim()) errors.review = 'Review text is required';
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, error: 'Validation failed', fields: errors });
    }
    const result = await reviewService.create({
      agent_id,
      user_id: req.user?.id || null,
      reviewer_name: reviewer_name.trim(),
      reviewer_email: (reviewer_email || '').trim(),
      rating: parseInt(rating, 10),
      title: (title || '').trim(),
      review: review.trim(),
      verified_purchase: !!verified_purchase,
    });
    return res.status(201).json({ success: true, data: result, message: 'Review submitted for moderation' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ success: false, error: 'Agent not found' });
    }
    next(err);
  }
}

async function markReviewHelpful(req, res, next) {
  try {
    const { id } = req.params;
    const count = await reviewService.markHelpful(id);
    if (count === null) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    return res.json({ success: true, data: { helpful_count: count } });
  } catch (err) {
    next(err);
  }
}

async function moderateReview(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const result = await reviewService.moderate(id, status);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAgentReviews,
  createReview,
  markReviewHelpful,
  moderateReview,
};
