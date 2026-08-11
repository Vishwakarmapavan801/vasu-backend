const pool = require('../../../config/database');
const mlsService = require('../../../services/mlsService');

async function listMyListings(agentId, mlsMemberId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;

  let mlsListings = [];
  if (mlsService && mlsMemberId) {
    try {
      let filter = `ListAgentMlsId%20eq%20'${encodeURIComponent(mlsMemberId)}'`;
      if (params.status && params.status !== 'all') {
        if (params.status === 'active') filter += `%20and%20MlsStatus%20eq%20'Active'`;
        else if (params.status === 'pending') filter += `%20and%20MlsStatus%20eq%20'Pending'`;
        else if (params.status === 'sold') filter += `%20and%20MlsStatus%20eq%20'Sold'`;
      }
      const sortClause = params.sort === 'price' ? 'ListPrice' : 'ModificationTimestamp';
      const orderClause = params.order === 'asc' ? 'asc' : 'desc';
      const url = `${process.env.MLS_GRID_BASE_URL || 'https://api-demo.mlsgrid.com/v2'}/Property?$filter=${filter}&$orderby=${sortClause}%20${orderClause}&$top=200`;
      const response = await mlsService.fetchWithRetry(url);
      if (response && response.value) {
        mlsListings = response.value.map(item => mlsService.normalizeProperty(item));
      }
    } catch (e) {
      console.warn('[ListingService] MLS fetch failed:', e.message);
    }
  }

  const listingKeys = mlsListings.map(l => l.ListingKey).filter(Boolean);
  const metas = await getMetasByKeys(agentId, listingKeys);

  const data = mlsListings.map(listing => {
    const meta = metas.find(m => m.listing_key === listing.ListingKey) || {};
    return {
      ...listing,
      local_status: meta.local_status || listing.MlsStatus?.toLowerCase() || 'active',
      local_price: meta.local_price ? parseFloat(meta.local_price) : listing.ListPrice,
      notes: meta.notes || null,
      featured: meta.featured || false,
      open_house_date: meta.open_house_date || null,
      open_house_start: meta.open_house_start || null,
      open_house_end: meta.open_house_end || null,
      custom_title: meta.custom_title || null,
      custom_description: meta.custom_description || null,
    };
  });

  const total = data.length;

  if (params.search) {
    const s = params.search.toLowerCase();
    return {
      success: true,
      data: data.filter(l =>
        (l.UnparsedAddress || '').toLowerCase().includes(s) ||
        (l.ListingId || '').toLowerCase().includes(s) ||
        (l.City || '').toLowerCase().includes(s)
      ).slice(offset, offset + limit),
      pagination: { page, limit, total: data.length, totalPages: Math.ceil(data.length / limit), hasMore: offset + limit < data.length },
    };
  }

  return {
    success: true,
    data: data.slice(offset, offset + limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: offset + limit < total },
  };
}

async function getListingDetail(agentId, listingKey) {
  let listing = null;
  if (mlsService) {
    try {
      const url = `${process.env.MLS_GRID_BASE_URL || 'https://api-demo.mlsgrid.com/v2'}/Property('${encodeURIComponent(listingKey)}')?$expand=Media`;
      const response = await mlsService.fetchWithRetry(url);
      if (response) listing = mlsService.normalizeProperty(response, { maxMedia: 0 });
    } catch (e) {
      console.warn('[ListingService] MLS detail fetch failed:', e.message);
    }
  }

  const meta = await getListingMeta(agentId, listingKey);
  const analytics = await getListingAnalytics(agentId, listingKey);
  const savedCount = await getListingSavedCount(listingKey);

  return { listing, meta, analytics, saved_count: savedCount };
}

async function getListingMeta(agentId, listingKey) {
  const { rows } = await pool.query(
    'SELECT * FROM agent_listing_meta WHERE agent_id = $1 AND listing_key = $2',
    [agentId, listingKey]
  );
  return rows[0] || null;
}

async function updateListingMeta(agentId, listingKey, data) {
  const existing = await pool.query(
    'SELECT id FROM agent_listing_meta WHERE agent_id = $1 AND listing_key = $2',
    [agentId, listingKey]
  );

  const allowedFields = ['local_status', 'local_price', 'notes', 'featured', 'open_house_date', 'open_house_start', 'open_house_end', 'custom_title', 'custom_description', 'listing_id', 'mls_status'];

  if (existing.rows.length) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (!allowedFields.includes(key) || value === undefined) continue;
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
    if (!fields.length) return getListingMeta(agentId, listingKey);
    values.push(agentId, listingKey);
    const { rows } = await pool.query(
      `UPDATE agent_listing_meta SET ${fields.join(', ')}, updated_at = NOW() WHERE agent_id = $${idx} AND listing_key = $${idx + 1} RETURNING *`,
      values
    );
    return rows[0];
  }

  const columns = ['agent_id', 'listing_key'];
  const placeholders = ['$1', '$2'];
  const values = [agentId, listingKey];
  let idx = 3;
  for (const [key, value] of Object.entries(data)) {
    if (!allowedFields.includes(key) || value === undefined) continue;
    columns.push(key);
    placeholders.push(`$${idx}`);
    values.push(value);
    idx++;
  }
  const { rows } = await pool.query(
    `INSERT INTO agent_listing_meta (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteListing(agentId, listingKey) {
  await pool.query('DELETE FROM agent_listing_meta WHERE agent_id = $1 AND listing_key = $2', [agentId, listingKey]);
  await pool.query('INSERT INTO agent_activity_log (agent_id, activity_type, description, listing_key) VALUES ($1, $2, $3, $4)',
    [agentId, 'listing_removed', `Listing ${listingKey} removed`, listingKey]);
  return { deleted: true };
}

async function getListingAnalytics(agentId, listingKey) {
  const [views, inquiries, tours] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM agent_listing_views WHERE agent_id = $1 AND listing_key = $2', [agentId, listingKey]),
    pool.query('SELECT COUNT(*)::int AS count FROM agent_listing_inquiries WHERE agent_id = $1 AND listing_key = $2', [agentId, listingKey]),
    pool.query('SELECT COUNT(*)::int AS count FROM agent_tour_requests WHERE agent_id = $1 AND property_id = $2', [agentId, listingKey]),
  ]);
  return {
    views: views.rows[0].count,
    inquiries: inquiries.rows[0].count,
    tours: tours.rows[0].count,
  };
}

async function getListingInquiries(agentId, listingKey, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM agent_listing_inquiries WHERE agent_id = $1 AND listing_key = $2',
    [agentId, listingKey]
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    'SELECT * FROM agent_listing_inquiries WHERE agent_id = $1 AND listing_key = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
    [agentId, listingKey, limit, offset]
  );

  return {
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: offset + limit < total },
  };
}

async function getListingSavedCount(listingKey) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM favorites WHERE listing_key = $1',
    [listingKey]
  );
  return rows[0].count;
}

async function logListingView(agentId, listingKey, userId, ipAddress) {
  await pool.query(
    'INSERT INTO agent_listing_views (agent_id, listing_key, user_id, ip_address) VALUES ($1, $2, $3, $4)',
    [agentId, listingKey, userId, ipAddress]
  );
}

async function getMetasByKeys(agentId, listingKeys) {
  if (!listingKeys.length) return [];
  const placeholders = listingKeys.map((_, i) => `$${i + 2}`).join(', ');
  const { rows } = await pool.query(
    `SELECT * FROM agent_listing_meta WHERE agent_id = $1 AND listing_key IN (${placeholders})`,
    [agentId, ...listingKeys]
  );
  return rows;
}

module.exports = {
  listMyListings,
  getListingDetail,
  getListingMeta,
  updateListingMeta,
  deleteListing,
  getListingAnalytics,
  getListingInquiries,
  getListingSavedCount,
  logListingView,
};
