const agentService = require('../services/agentService');
const reviewResponseService = require('../services/reviewResponseService');

async function getReviewResponses(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const responses = await reviewResponseService.getByAgentId(agent.id);
    return res.status(200).json({ success: true, data: responses });
  } catch (err) { next(err); }
}

async function createReviewResponse(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { reviewId, response } = req.body;
    if (!reviewId || !response || !response.trim()) {
      return res.status(400).json({ success: false, error: 'Review ID and response text are required' });
    }
    const result = await reviewResponseService.create(agent.id, reviewId, response.trim());
    return res.status(201).json({ success: true, data: result, message: 'Response submitted successfully' });
  } catch (err) { next(err); }
}

async function updateReviewResponse(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { id } = req.params;
    const { response } = req.body;
    if (!response || !response.trim()) {
      return res.status(400).json({ success: false, error: 'Response text is required' });
    }
    const result = await reviewResponseService.update(id, agent.id, response.trim());
    if (!result) return res.status(404).json({ success: false, error: 'Response not found' });
    return res.status(200).json({ success: true, data: result, message: 'Response updated successfully' });
  } catch (err) { next(err); }
}

async function deleteReviewResponse(req, res, next) {
  try {
    const agent = await agentService.getByUserId(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    const { id } = req.params;
    await reviewResponseService.remove(id, agent.id);
    return res.status(200).json({ success: true, message: 'Response deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  getReviewResponses,
  createReviewResponse,
  updateReviewResponse,
  deleteReviewResponse,
};
