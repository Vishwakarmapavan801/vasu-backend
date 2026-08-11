const pool = require('../../../config/database');

const AGENT_COLUMNS = [
  'id', 'user_id', 'full_name', 'profile_photo_url', 'designation', 'company_name',
  'license_number', 'phone', 'whatsapp', 'email', 'office_address', 'city', 'state',
  'country', 'zip_code', 'experience_years', 'bio', 'languages', 'specialties',
  'areas_served', 'website', 'instagram', 'facebook', 'linkedin',
  'is_verified', 'status', 'created_at', 'updated_at'
];

const AGENT_FIELDS = AGENT_COLUMNS.join(', ');

const ALLOWED_SORT_FIELDS = ['full_name', 'created_at', 'experience_years', 'response_rate'];

function rowToAgent(row) {
  if (!row) return null;
  return {
    ...row,
    languages: typeof row.languages === 'string' ? JSON.parse(row.languages) : (row.languages || []),
    specialties: typeof row.specialties === 'string' ? JSON.parse(row.specialties) : (row.specialties || []),
    areas_served: typeof row.areas_served === 'string' ? JSON.parse(row.areas_served) : (row.areas_served || []),
  };
}

async function findAll(params = {}) {
  const {
    page = 1, limit = 20, search, city, state, specialty, language,
    minRating, verifiedOnly, sort = 'created_at', order = 'desc'
  } = params;
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  let idx = 1;

  if (search) {
    conditions.push(`(full_name ILIKE $${idx} OR city ILIKE $${idx} OR state ILIKE $${idx} OR company_name ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (city) {
    conditions.push(`city ILIKE $${idx}`);
    values.push(city);
    idx++;
  }

  if (state) {
    conditions.push(`state ILIKE $${idx}`);
    values.push(state);
    idx++;
  }

  if (specialty) {
    conditions.push(`$${idx} = ANY(specialties)`);
    values.push(specialty);
    idx++;
  }

  if (language) {
    conditions.push(`$${idx} = ANY(languages)`);
    values.push(language);
    idx++;
  }

  if (verifiedOnly) {
    conditions.push(`is_verified = true`);
  }

  if (minRating) {
    conditions.push(`avg_rating >= $${idx}::numeric`);
    values.push(minRating);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortField = ALLOWED_SORT_FIELDS.includes(sort) ? sort : 'created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM agents ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const { rows } = await pool.query(
    `SELECT a.*,
      COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM agent_reviews WHERE agent_id = a.id AND status = 'approved'), 0) AS avg_rating
     FROM agents a
     ${where}
     ORDER BY a.${sortField} ${sortOrder}
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    success: true,
    data: rows.map(rowToAgent),
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
  };
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agents WHERE id = $1`,
    [id]
  );
  return rowToAgent(rows[0] || null);
}

async function findByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agents WHERE user_id = $1`,
    [userId]
  );
  return rowToAgent(rows[0] || null);
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agents WHERE email = $1`,
    [email]
  );
  return rowToAgent(rows[0] || null);
}

async function create(data) {
  const columns = [];
  const placeholders = [];
  const values = [];
  let idx = 1;

  for (const col of AGENT_COLUMNS) {
    if (col === 'id' || col === 'created_at' || col === 'updated_at') continue;
    if (data[col] === undefined) continue;

    columns.push(col);
    placeholders.push(`$${idx}`);

    if (Array.isArray(data[col])) {
      values.push(JSON.stringify(data[col]));
    } else {
      values.push(data[col]);
    }
    idx++;
  }

  if (!columns.length) {
    throw new Error('No data provided for agent creation');
  }

  const { rows } = await pool.query(
    `INSERT INTO agents (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${AGENT_FIELDS}`,
    values
  );
  return rowToAgent(rows[0]);
}

async function update(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!AGENT_COLUMNS.includes(key) || key === 'id' || key === 'created_at' || key === 'updated_at') continue;
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      fields.push(`${key} = $${idx}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      fields.push(`${key} = $${idx}`);
      values.push(value);
    }
    idx++;
  }

  if (!fields.length) return findById(id);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE agents SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING ${AGENT_FIELDS}`,
    values
  );
  return rowToAgent(rows[0] || null);
}

async function updateStatus(id, status) {
  const allowed = ['pending', 'approved', 'rejected', 'suspended'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${allowed.join(', ')}`);
  }
  const { rows } = await pool.query(
    `UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING ${AGENT_FIELDS}`,
    [status, id]
  );
  return rowToAgent(rows[0] || null);
}

async function updateVerification(id, isVerified) {
  const { rows } = await pool.query(
    `UPDATE agents SET is_verified = $1, updated_at = NOW() WHERE id = $2 RETURNING ${AGENT_FIELDS}`,
    [isVerified, id]
  );
  return rowToAgent(rows[0] || null);
}

async function countByStatus(status) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agents WHERE status = $1`,
    [status]
  );
  return rows[0].count;
}

async function getStats(agentId) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE((SELECT COUNT(*)::int FROM agent_listings WHERE agent_id = $1 AND status = 'sold'), 0) AS total_sold,
      COALESCE((SELECT COUNT(*)::int FROM agent_reviews WHERE agent_id = $1), 0) AS review_count,
      COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM agent_reviews WHERE agent_id = $1 AND status = 'approved'), 0) AS avg_rating,
      COALESCE((SELECT COUNT(*)::int FROM agent_profile_views WHERE agent_id = $1), 0) AS profile_views,
      COALESCE((SELECT COUNT(*)::int FROM agent_followers WHERE agent_id = $1), 0) AS followers,
      COALESCE((SELECT COUNT(*)::int FROM agent_tour_requests WHERE agent_id = $1), 0) AS tour_requests,
      COALESCE((SELECT COUNT(*)::int FROM agent_tour_requests WHERE agent_id = $1 AND status = 'confirmed'), 0) AS confirmed_tours
    FROM agents WHERE id = $1`,
    [agentId]
  );

  if (!rows.length) return null;

  const stats = rows[0];
  return {
    totalSold: stats.total_sold,
    reviewCount: stats.review_count,
    avgRating: parseFloat(stats.avg_rating) || 0,
    profileViews: stats.profile_views,
    followers: stats.followers,
    tourRequests: stats.tour_requests,
    confirmedTours: stats.confirmed_tours,
    responseTime: null,
    responseRate: null,
  };
}

module.exports = {
  findAll,
  findById,
  findByUserId,
  findByEmail,
  create,
  update,
  updateStatus,
  updateVerification,
  countByStatus,
  getStats,
};
