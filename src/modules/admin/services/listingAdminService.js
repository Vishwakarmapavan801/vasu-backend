/**
 * Admin Listing Service
 *
 * Listing management is split into two layers:
 *  1. MLS Grid (source of record) — read-only, via propertyService
 *  2. listing_admin_meta (platform-only) — featured / archived toggles
 *
 * Admin actions NEVER modify the MLS Grid source data.
 */

const pool = require('../../../config/database');
const propertyService = require('../../../services/propertyService');
const imageProcessor = require('../../../services/imageProcessor');

/**
 * Search MLS listings with the standard search pipeline.
 * Supports the same filters as the public API plus admin-specific params.
 */
async function search(params = {}) {
  const { listingId, key, city, agentMlsId, officeId, status, propertyType, priceMin, priceMax, zip, beds, baths, sqftMin, orderby } = params;
  const top = Math.max(1, Math.min(parseInt(params.top, 10) || 20, 100));
  const skip = Math.max(0, parseInt(params.skip, 10) || 0);

  // Direct listing lookups
  if (listingId || key) {
    const detail = await propertyService.getPropertyByIdWithAllMedia(listingId || key);
    if (!detail) {
      return { success: true, data: [], totalCount: 0, page: 0, pageSize: top, hasMore: false };
    }
    const meta = await getMeta(detail.ListingKey || detail.ListingId);
    return {
      success: true,
      data: [{ ...detail, admin_meta: meta }],
      totalCount: 1,
      page: 0,
      pageSize: top,
      hasMore: false,
    };
  }

  if (city) {
    const result = await propertyService.getPropertiesByCity(city, {
      top,
      skip,
      status,
      propertyType,
      priceMin,
      priceMax,
      beds,
      baths,
      minSqft: sqftMin,
      orderby,
    });
    return withMeta(result);
  }

  const filters = {
    top,
    skip,
    status,
    propertyType,
    orderby,
    applyBrokerageScope: false,
  };
  if (officeId) filters.officeId = officeId;
  if (priceMin) filters.priceMin = Number(priceMin);
  if (priceMax) filters.priceMax = Number(priceMax);
  if (zip) filters.zip = zip;
  if (beds) filters.minBeds = Number(beds);
  if (baths) filters.minBaths = Number(baths);
  if (sqftMin) filters.minSqft = Number(sqftMin);

  const result = agentMlsId
    ? await propertyService.getPropertiesByAgent(agentMlsId, filters)
    : await propertyService.getProperties(filters);

  return withMeta(result);
}

async function withMeta(result) {
  const data = result.data || [];
  if (data.length === 0) {
    return { ...result, data: [] };
  }
  const keys = data.map((p) => p.ListingKey || p.ListingId).filter(Boolean);
  const metas = await getMetas(keys);
  return {
    ...result,
    data: data.map((p) => ({ ...p, admin_meta: metas[p.ListingKey || p.ListingId] || null })),
  };
}

async function getMetas(keys) {
  if (!keys || keys.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT listing_key, is_featured, featured_priority, is_archived, archived_at, notes, updated_at
     FROM listing_admin_meta WHERE listing_key = ANY($1)`,
    [keys]
  );
  return rows.reduce((acc, row) => {
    acc[row.listing_key] = row;
    return acc;
  }, {});
}

async function getMeta(listingKey) {
  if (!listingKey) return null;
  const { rows } = await pool.query(
    `SELECT listing_key, is_featured, featured_priority, is_archived, archived_at, notes, updated_at
     FROM listing_admin_meta WHERE listing_key = $1`,
    [listingKey]
  );
  return rows[0] || null;
}

/**
 * Full MLS detail with every media item (no maxMedia cap).
 */
async function getDetail(listingKey) {
  const detail = await propertyService.getPropertyByIdWithAllMedia(listingKey);
  if (!detail) return null;
  const meta = await getMeta(detail.ListingKey || detail.ListingId);
  return { ...detail, admin_meta: meta };
}

async function upsertMeta(listingKey, patch, adminId) {
  await pool.query(
    `INSERT INTO listing_admin_meta (listing_key, is_featured, featured_priority, is_archived, archived_at, notes, updated_by, updated_at)
     VALUES ($1, COALESCE($2, FALSE), COALESCE($3, 0), COALESCE($4, FALSE), $5, $6, $7, NOW())
     ON CONFLICT (listing_key) DO UPDATE SET
       is_featured = COALESCE(EXCLUDED.is_featured, listing_admin_meta.is_featured),
       featured_priority = COALESCE(EXCLUDED.featured_priority, listing_admin_meta.featured_priority),
       is_archived = COALESCE(EXCLUDED.is_archived, listing_admin_meta.is_archived),
       archived_at = CASE WHEN COALESCE(EXCLUDED.is_archived, listing_admin_meta.is_archived) THEN NOW() ELSE NULL END,
       notes = COALESCE(EXCLUDED.notes, listing_admin_meta.notes),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [listingKey, patch.is_featured, patch.featured_priority, patch.is_archived, patch.archived_at, patch.notes, adminId]
  );
  return getMeta(listingKey);
}

async function setFeatured(listingKey, { featured, priority }, adminId) {
  return upsertMeta(
    listingKey,
    { is_featured: !!featured, featured_priority: Math.max(0, parseInt(priority, 10) || 0) },
    adminId
  );
}

async function setArchived(listingKey, { archived }, adminId) {
  return upsertMeta(listingKey, { is_archived: !!archived }, adminId);
}

/**
 * Refresh media pipeline for a listing: drop cached variants and re-warm
 * the image variants for every media item. Uses the same imageProcessor the
 * /api/image proxy runs on — no media is duplicated or stored by the admin.
 */
async function refreshPhotos(listingKey) {
  const detail = await propertyService.getPropertyByIdWithAllMedia(listingKey);
  if (!detail) return { refreshed: 0, mediaCount: 0 };

  const media = (detail.Media || detail.images || []).filter((m) => m?.MediaKey);
  for (const m of media) {
    try {
      await imageProcessor.invalidateVariants(m.MediaKey);
      imageProcessor.enqueueWarm(m.MediaKey);
    } catch (_) {
      // variant invalidation is best-effort
    }
  }
  return { refreshed: media.length, mediaCount: media.length, listingKey };
}

module.exports = {
  search,
  getDetail,
  getMeta,
  getMetas,
  setFeatured,
  setArchived,
  refreshPhotos,
};
