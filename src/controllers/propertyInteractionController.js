const interactionService = require('../services/propertyInteractionService');

// ================================================================
// Property History
// ================================================================

async function getHistory(req, res, next) {
  try {
    const { listingKey } = req.params;
    const { page, limit } = req.query;
    const result = await interactionService.getPropertyHistory(listingKey, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// ================================================================
// Recently Viewed
// ================================================================

async function getRecentlyViewed(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { page, limit } = req.query;
    const result = await interactionService.getRecentlyViewed(req.user.id, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 50),
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function addRecentlyViewed(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { listing_key, listing_id, property_data } = req.body;
    if (!listing_key) {
      return res.status(400).json({ success: false, error: 'listing_key is required' });
    }
    const result = await interactionService.addRecentlyViewed(
      req.user.id, listing_key, listing_id, property_data
    );
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function clearRecentlyViewed(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const result = await interactionService.clearRecentlyViewed(req.user.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// ================================================================
// Property Comparisons
// ================================================================

async function getComparisons(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const result = await interactionService.getComparisons(req.user.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createComparison(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { name } = req.body;
    const result = await interactionService.createComparison(req.user.id, name);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function addToComparison(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { id } = req.params;
    const { listing_key, listing_id, property_data } = req.body;
    if (!listing_key) {
      return res.status(400).json({ success: false, error: 'listing_key is required' });
    }
    const result = await interactionService.addToComparison(
      id, req.user.id, listing_key, listing_id, property_data
    );
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function removeFromComparison(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { id, listingKey } = req.params;
    const result = await interactionService.removeFromComparison(id, req.user.id, listingKey);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteComparison(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { id } = req.params;
    const result = await interactionService.deleteComparison(id, req.user.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHistory,
  getRecentlyViewed,
  addRecentlyViewed,
  clearRecentlyViewed,
  getComparisons,
  createComparison,
  addToComparison,
  removeFromComparison,
  deleteComparison,
};
