/**
 * Favorites Controller
 *
 * Handles CRUD operations for user's saved/favorited properties.
 * All endpoints require authentication (verified by requireAuth middleware).
 * Favorites are stored in PostgreSQL with a unique constraint on (user_id, listing_key).
 */

const pool = require('../config/database');
const propertyService = require('../services/propertyService');

/**
 * Build a 400 error response.
 */
function badRequest(res, message) {
  return res.status(400).json({ success: false, error: message });
}

/**
 * Build a 404 error response.
 */
function notFound(res, message) {
  return res.status(404).json({ success: false, error: message });
}

// ================================================================
// GET /api/favorites
// ================================================================
async function listFavorites(req, res, next) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM favorites WHERE user_id = $1',
      [userId]
    );
    const total = countResult.rows[0].total;

    // Get favorites with pagination
    const result = await pool.query(
      `SELECT id, listing_key, property_data, created_at
       FROM favorites
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // For favorites without cached property_data, fetch from MLS
    const favorites = await Promise.all(
      result.rows.map(async (fav) => {
        if (fav.property_data) {
          return {
            id: fav.id,
            listingKey: fav.listing_key,
            property: fav.property_data,
            createdAt: fav.created_at,
          };
        }
        // Fetch from MLS and cache
        try {
          const mlsResult = await propertyService.getPropertyByKey(fav.listing_key);
          const property = mlsResult?.data || null;
          if (property) {
            // Cache the property data for next time
            await pool.query(
              'UPDATE favorites SET property_data = $1 WHERE id = $2',
              [JSON.stringify(property), fav.id]
            );
          }
          return {
            id: fav.id,
            listingKey: fav.listing_key,
            property,
            createdAt: fav.created_at,
          };
        } catch (_) {
          return {
            id: fav.id,
            listingKey: fav.listing_key,
            property: null,
            createdAt: fav.created_at,
          };
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: favorites,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// POST /api/favorites/:listingKey
// ================================================================
async function addFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { listingKey } = req.params;

    if (!listingKey || listingKey.trim().length === 0) {
      return badRequest(res, 'Listing key is required.');
    }

    // Check if already favorited
    const existing = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND listing_key = $2',
      [userId, listingKey]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Property is already in your favorites.',
        data: { id: existing.rows[0].id, listingKey },
      });
    }

    // Try to fetch property data for caching
    let propertyData = null;
    try {
      const mlsResult = await propertyService.getPropertyByKey(listingKey);
      propertyData = mlsResult?.data || null;
    } catch (_) {
      // Non-critical: favorite is saved even if MLS fetch fails
    }

    // Insert favorite
    const result = await pool.query(
      `INSERT INTO favorites (user_id, listing_key, property_data)
       VALUES ($1, $2, $3)
       RETURNING id, listing_key, created_at`,
      [userId, listingKey, propertyData ? JSON.stringify(propertyData) : null]
    );

    const fav = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Property saved to favorites!',
      data: {
        id: fav.id,
        listingKey: fav.listing_key,
        createdAt: fav.created_at,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(200).json({
        success: true,
        message: 'Property is already in your favorites.',
      });
    }
    next(err);
  }
}

// ================================================================
// DELETE /api/favorites/:listingKey
// ================================================================
async function removeFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { listingKey } = req.params;

    if (!listingKey || listingKey.trim().length === 0) {
      return badRequest(res, 'Listing key is required.');
    }

    const result = await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND listing_key = $2 RETURNING id',
      [userId, listingKey]
    );

    if (result.rows.length === 0) {
      return notFound(res, 'Favorite not found.');
    }

    return res.status(200).json({
      success: true,
      message: 'Property removed from favorites.',
    });
  } catch (err) {
    next(err);
  }
}

// ================================================================
// GET /api/favorites/check/:listingKey
// ================================================================
async function checkFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { listingKey } = req.params;

    if (!listingKey) {
      return badRequest(res, 'Listing key is required.');
    }

    const result = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND listing_key = $2',
      [userId, listingKey]
    );

    return res.status(200).json({
      success: true,
      isFavorite: result.rows.length > 0,
      data: result.rows.length > 0 ? { id: result.rows[0].id } : null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
};
