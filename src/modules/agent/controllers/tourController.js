const tourService = require('../services/tourService');

async function requestTour(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, phone, message, preferred_date, preferred_time, property_id } = req.body;
    const errors = {};
    if (!name || !name.trim()) errors.name = 'Name is required';
    if (!email || !email.trim()) errors.email = 'Email is required';
    if (!preferred_date) errors.preferred_date = 'Preferred date is required';
    if (!preferred_time) errors.preferred_time = 'Preferred time is required';
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, error: 'Validation failed', fields: errors });
    }
    const tour = await tourService.request({
      agent_id: id,
      user_id: req.user?.id || null,
      name: name.trim(),
      email: email.trim(),
      phone: (phone || '').trim(),
      message: (message || '').trim(),
      preferred_date,
      preferred_time,
      property_id: property_id || null,
    });
    return res.status(201).json({ success: true, data: tour, message: 'Tour request submitted successfully' });
  } catch (err) { next(err); }
}

async function listAgentTours(req, res, next) {
  try {
    const agentId = req.user.id;
    const { page, limit, status, sort, order } = req.query;
    const result = await tourService.listByAgent(agentId, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      status, sort, order,
    });
    return res.status(200).json({ success: true, data: result.data, pagination: result.pagination, message: 'Tours retrieved successfully' });
  } catch (err) { next(err); }
}

async function updateTourStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be one of: pending, confirmed, completed, cancelled' });
    }
    const tour = await tourService.updateStatus(id, req.user.id, status);
    if (!tour) {
      return res.status(404).json({ success: false, error: 'Tour not found' });
    }
    return res.status(200).json({ success: true, data: tour, message: 'Tour status updated successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  requestTour,
  listAgentTours,
  updateTourStatus,
};
