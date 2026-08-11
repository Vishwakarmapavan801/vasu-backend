const reviewService = require('../services/reviewService');

async function getAgentReviews(req, res, next) {
  try {
    const { id } = req.params;
    const { page, limit, sort, order, rating } = req.query;
    const result = await reviewService.getAgentReviews(id, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 10, 50),
      sort, order, rating: rating ? parseInt(rating, 10) : undefined,
    });
    return res.status(200).json({ success: true, data: result.data, ratingSummary: result.ratingSummary, pagination: result.pagination, message: 'Reviews retrieved successfully' });
  } catch (err) { next(err); }
}

async function createReview(req, res, next) {
  try {
    const { id } = req.params;
    const { rating, title, review } = req.body;
    const errors = {};
    if (!rating || rating < 1 || rating > 5) errors.rating = 'Rating must be between 1 and 5';
    if (!review || !review.trim()) errors.review = 'Review text is required';
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, error: 'Validation failed', fields: errors });
    }
    const result = await reviewService.createReview({
      agent_id: id,
      user_id: req.user.id,
      rating: parseInt(rating, 10),
      title: (title || '').trim(),
      review: review.trim(),
    });
    return res.status(201).json({ success: true, data: result, message: 'Review submitted successfully' });
  } catch (err) { next(err); }
}

async function updateReview(req, res, next) {
  try {
    const { id } = req.params;
    const review = await reviewService.getReviewById(id);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    if (review.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only edit your own reviews' });
    }
    const updated = await reviewService.updateReview(id, req.body);
    return res.status(200).json({ success: true, data: updated, message: 'Review updated successfully' });
  } catch (err) { next(err); }
}

async function deleteReview(req, res, next) {
  try {
    const { id } = req.params;
    const review = await reviewService.getReviewById(id);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    if (review.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this review' });
    }
    await reviewService.deleteReview(id);
    return res.status(200).json({ success: true, message: 'Review deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  getAgentReviews,
  createReview,
  updateReview,
  deleteReview,
};
