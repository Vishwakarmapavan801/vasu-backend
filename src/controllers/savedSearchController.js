const pool = require('../config/database');
const savedSearchService = require('../services/savedSearchService');

function badRequest(res, message) {
  return res.status(400).json({ success: false, error: message });
}

async function listSavedSearches(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await savedSearchService.findByUserId(userId, req.query);
    return res.status(200).json({ success: true, data: result.searches, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

async function getSavedSearch(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const search = await savedSearchService.findById(id, userId);
    if (!search) {
      return res.status(404).json({ success: false, error: 'Saved search not found.' });
    }
    return res.status(200).json({ success: true, data: search });
  } catch (err) {
    next(err);
  }
}

async function createSavedSearch(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, search_params, notify_on_new, notify_on_price_change, frequency } = req.body;
    if (!name || !name.trim()) {
      return badRequest(res, 'Search name is required.');
    }
    const search = await savedSearchService.create(userId, { name, search_params, notify_on_new, notify_on_price_change, frequency });
    return res.status(201).json({ success: true, message: 'Saved search created.', data: search });
  } catch (err) {
    next(err);
  }
}

async function updateSavedSearch(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const search = await savedSearchService.update(id, userId, req.body);
    if (!search) {
      return res.status(404).json({ success: false, error: 'Saved search not found.' });
    }
    return res.status(200).json({ success: true, message: 'Saved search updated.', data: search });
  } catch (err) {
    next(err);
  }
}

async function deleteSavedSearch(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await savedSearchService.remove(id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Saved search not found.' });
    }
    return res.status(200).json({ success: true, message: 'Saved search deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listSavedSearches, getSavedSearch, createSavedSearch, updateSavedSearch, deleteSavedSearch };
