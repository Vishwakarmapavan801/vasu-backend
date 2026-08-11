const pool = require('../../../config/database');

// === Neighborhoods ===
async function getNeighborhoodStats(params) {
  const { city, neighborhood, state, limit = 20, offset = 0 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (city) { conditions.push(`ns.city ILIKE $${idx++}`); vals.push(`%${city}%`); }
  if (neighborhood) { conditions.push(`ns.neighborhood ILIKE $${idx++}`); vals.push(`%${neighborhood}%`); }
  if (state) { conditions.push(`ns.state = $${idx++}`); vals.push(state); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT ns.*, COALESCE(json_agg(oh.*) FILTER (WHERE oh.id IS NOT NULL), '[]') AS open_houses FROM neighborhood_stats ns LEFT JOIN open_houses oh ON oh.listing_key IN (SELECT listing_key FROM listing_metadata WHERE is_featured = TRUE) ${where} GROUP BY ns.id ORDER BY ns.inventory_count DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, limit, offset]);
  return rows;
}

async function getNeighborhoodByCity(city) {
  const { rows } = await pool.query('SELECT * FROM neighborhood_stats WHERE city ILIKE $1 ORDER BY inventory_count DESC', [`%${city}%`]);
  return rows;
}

async function getNeighborhood(id) {
  const { rows } = await pool.query('SELECT * FROM neighborhood_stats WHERE id = $1', [id]);
  return rows[0] || null;
}

// === ZIP Codes ===
async function getZipStats(params) {
  const { zip_code, city, state, limit = 20, offset = 0 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (zip_code) { conditions.push(`zip_code ILIKE $${idx++}`); vals.push(`%${zip_code}%`); }
  if (city) { conditions.push(`city ILIKE $${idx++}`); vals.push(`%${city}%`); }
  if (state) { conditions.push(`state = $${idx++}`); vals.push(state); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT * FROM zip_market_stats ${where} ORDER BY inventory_count DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, limit, offset]);
  return rows;
}

async function getZipDetail(zip) {
  const { rows } = await pool.query('SELECT * FROM zip_market_stats WHERE zip_code = $1', [zip]);
  return rows[0] || null;
}

// === Schools ===
async function getSchools(params) {
  const { city, district, level, type, limit = 50 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (city) { conditions.push(`city ILIKE $${idx++}`); vals.push(`%${city}%`); }
  if (district) { conditions.push(`district ILIKE $${idx++}`); vals.push(`%${district}%`); }
  if (level) { conditions.push(`level = $${idx++}`); vals.push(level); }
  if (type) { conditions.push(`type = $${idx++}`); vals.push(type); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT * FROM school_districts ${where} ORDER BY rating DESC NULLS LAST LIMIT $${idx++}`, [...vals, limit]);
  return rows;
}

async function getSchool(id) {
  const { rows } = await pool.query('SELECT * FROM school_districts WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getSchoolsByNeighborhood(neighborhoodId) {
  const { rows } = await pool.query(`SELECT sd.*, ns.distance_miles, ns.is_zoned FROM school_districts sd INNER JOIN neighborhood_schools ns ON ns.school_id = sd.id WHERE ns.neighborhood_id = $1 ORDER BY sd.rating DESC NULLS LAST`, [neighborhoodId]);
  return rows;
}

// === Commute ===
async function getCommuteData(params) {
  const { origin_type, origin_id, origin_name, destination } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (origin_type) { conditions.push(`origin_type = $${idx++}`); vals.push(origin_type); }
  if (origin_id) { conditions.push(`origin_id = $${idx++}`); vals.push(origin_id); }
  if (origin_name) { conditions.push(`origin_name ILIKE $${idx++}`); vals.push(`%${origin_name}%`); }
  if (destination) { conditions.push(`destination ILIKE $${idx++}`); vals.push(`%${destination}%`); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT * FROM commute_data ${where} ORDER BY driving_minutes NULLS LAST`);
  return rows;
}

// === Nearby Places ===
async function getNearbyPlaces(params) {
  const { place_type, city, neighborhood_id, limit = 50 } = params;
  const conditions = []; const vals = []; let idx = 1;
  if (place_type) { conditions.push(`place_type = $${idx++}`); vals.push(place_type); }
  if (city) { conditions.push(`city ILIKE $${idx++}`); vals.push(`%${city}%`); }
  if (neighborhood_id) { conditions.push(`neighborhood_id = $${idx++}`); vals.push(neighborhood_id); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT * FROM nearby_places ${where} ORDER BY name LIMIT $${idx++}`, [...vals, limit]);
  return rows;
}

// === Trending Topics ===
async function getTrendingTopics(topic_type, limit = 10) {
  const { rows } = await pool.query('SELECT * FROM trending_topics WHERE topic_type = $1 ORDER BY score DESC LIMIT $2', [topic_type, limit]);
  return rows;
}

// === Market Summary (computed from MLS data) ===
async function getMarketSummary(location, locationType = 'city') {
  if (locationType === 'zip') {
    const stats = await getZipDetail(location);
    if (!stats) return null;
    return { location, type: 'zip', ...stats };
  }
  const neighborhoods = await getNeighborhoodByCity(location);
  const total = neighborhoods.length;
  if (!total) return null;
  return {
    location,
    type: 'city',
    neighborhoodCount: total,
    medianHomePrice: avg(neighborhoods.map(n => n.median_home_price)),
    medianRent: avg(neighborhoods.map(n => n.median_rent)),
    avgPricePerSqft: avg(neighborhoods.map(n => n.price_per_sqft)),
    totalInventory: neighborhoods.reduce((s, n) => s + (n.inventory_count || 0), 0),
    avgDaysOnMarket: avg(neighborhoods.map(n => n.days_on_market)),
    totalSold30d: neighborhoods.reduce((s, n) => s + (n.sold_count_30d || 0), 0),
    avgSchoolRating: avg(neighborhoods.map(n => n.school_rating)),
    neighborhoods,
  };
}

function avg(arr) {
  const filtered = arr.filter(v => v != null);
  return filtered.length ? filtered.reduce((s, v) => s + Number(v), 0) / filtered.length : null;
}

// === Local Intel ===
async function getLocalIntel(locationType, locationName) {
  const { rows } = await pool.query('SELECT * FROM local_intel WHERE location_type = $1 AND location_name ILIKE $2', [locationType, locationName]);
  return rows[0] || null;
}

async function upsertLocalIntel(data) {
  const { location_type, location_name, hoa_info, flood_zone, flood_risk, school_boundaries, subdivision, builder_community, utility_providers, zoning, short_term_rental_allowed, property_tax_rate, tax_history } = data;
  const { rows } = await pool.query(`
    INSERT INTO local_intel (location_type, location_name, hoa_info, flood_zone, flood_risk, school_boundaries, subdivision, builder_community, utility_providers, zoning, short_term_rental_allowed, property_tax_rate, tax_history)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (location_type, location_name) DO UPDATE SET
      hoa_info = COALESCE(EXCLUDED.hoa_info, local_intel.hoa_info),
      flood_zone = COALESCE(EXCLUDED.flood_zone, local_intel.flood_zone),
      subdivision = COALESCE(EXCLUDED.subdivision, local_intel.subdivision),
      last_updated = NOW()
    RETURNING *`,
    [location_type || 'neighborhood', location_name, hoa_info || {}, flood_zone, flood_risk, school_boundaries || {}, subdivision, builder_community, utility_providers || {}, zoning, short_term_rental_allowed, property_tax_rate, tax_history || {}]
  );
  return rows[0];
}

async function getLocalIntelBySubdivision(subdivision) {
  const { rows } = await pool.query('SELECT * FROM local_intel WHERE subdivision ILIKE $1', [`%${subdivision}%`]);
  return rows;
}

async function getLocalIntelByListing(listingKey) {
  const { rows } = await pool.query('SELECT * FROM local_intel_map WHERE listing_key = $1 ORDER BY created_at DESC', [listingKey]);
  return rows;
}

async function upsertLocalIntelMap(data) {
  const { listing_key, intel_type, intel_value, source } = data;
  const { rows } = await pool.query(
    'INSERT INTO local_intel_map (listing_key, intel_type, intel_value, source) VALUES ($1, $2, $3, $4) RETURNING *',
    [listing_key, intel_type, intel_value || {}, source]
  );
  return rows[0];
}

module.exports = { getNeighborhoodStats, getNeighborhoodByCity, getNeighborhood, getZipStats, getZipDetail, getSchools, getSchool, getSchoolsByNeighborhood, getCommuteData, getNearbyPlaces, getTrendingTopics, getMarketSummary, getLocalIntel, upsertLocalIntel, getLocalIntelBySubdivision, getLocalIntelByListing, upsertLocalIntelMap };
