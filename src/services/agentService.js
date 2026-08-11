const pool = require('../config/database');

const AGENT_FIELDS = [
  'id', 'mls_member_id', 'user_id', 'name', 'email', 'phone',
  'photo_url', 'role', 'brokerage', 'brokerage_mls_id', 'license_number',
  'experience_years', 'about', 'certifications', 'languages', 'areas_served',
  'response_time', 'response_rate', 'social_links', 'office_name',
  'office_address', 'office_phone', 'office_email', 'office_hours',
  'is_active', 'is_verified', 'status', 'created_at', 'updated_at'
].join(', ');

function rowToAgent(row) {
  return {
    ...row,
    certifications: row.certifications || [],
    languages: row.languages || [],
    areas_served: row.areas_served || [],
    social_links: row.social_links || {},
    office_hours: row.office_hours || {},
  };
}

async function findByMlsMemberId(mlsMemberId) {
  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agent_profiles WHERE mls_member_id = $1`,
    [mlsMemberId]
  );
  return rows.length ? rowToAgent(rows[0]) : null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agent_profiles WHERE id = $1`,
    [id]
  );
  return rows.length ? rowToAgent(rows[0]) : null;
}

async function findByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agent_profiles WHERE user_id = $1`,
    [userId]
  );
  return rows.length ? rowToAgent(rows[0]) : null;
}

async function search(params = {}) {
  const {
    page = 1, limit = 20, search, sort = 'name', order = 'asc',
    brokerage, is_active, areas_served
  } = params;
  const offset = (page - 1) * limit;
  const conditions = [];
  const values = [];
  let idx = 1;

  conditions.push('is_active = true');

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR about ILIKE $${idx} OR brokerage ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (brokerage) {
    conditions.push(`brokerage ILIKE $${idx}`);
    values.push(`%${brokerage}%`);
    idx++;
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${idx}`);
    values.push(is_active);
    idx++;
  }

  if (areas_served) {
    conditions.push(`$${idx} = ANY(areas_served)`);
    values.push(areas_served);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSort = ['name', 'created_at', 'experience_years', 'response_rate'].includes(sort) ? sort : 'name';
  const allowedOrder = order === 'desc' ? 'DESC' : 'ASC';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM agent_profiles ${where}`, values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const { rows } = await pool.query(
    `SELECT ${AGENT_FIELDS} FROM agent_profiles ${where} ORDER BY ${allowedSort} ${allowedOrder} LIMIT $${idx} OFFSET $${idx + 1}`,
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

async function upsert(mlsMemberId, data) {
  const existing = await findByMlsMemberId(mlsMemberId);
  if (existing) {
    const { rows } = await pool.query(
      `UPDATE agent_profiles SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        photo_url = COALESCE($4, photo_url),
        role = COALESCE($5, role),
        brokerage = COALESCE($6, brokerage),
        brokerage_mls_id = COALESCE($7, brokerage_mls_id),
        license_number = COALESCE($8, license_number),
        experience_years = COALESCE($9, experience_years),
        about = COALESCE($10, about),
        certifications = COALESCE($11, certifications),
        languages = COALESCE($12, languages),
        areas_served = COALESCE($13, areas_served),
        response_time = COALESCE($14, response_time),
        response_rate = COALESCE($15, response_rate),
        social_links = CASE WHEN $16::jsonb IS NOT NULL THEN $16 ELSE social_links END,
        office_name = COALESCE($17, office_name),
        office_address = COALESCE($18, office_address),
        office_phone = COALESCE($19, office_phone),
        office_email = COALESCE($20, office_email),
        office_hours = CASE WHEN $21::jsonb IS NOT NULL THEN $21 ELSE office_hours END,
        is_active = COALESCE($22, is_active),
        is_verified = COALESCE($23, is_verified)
      WHERE mls_member_id = $24
      RETURNING ${AGENT_FIELDS}`,
      [
        data.name, data.email, data.phone, data.photo_url,
        data.role, data.brokerage, data.brokerage_mls_id, data.license_number,
        data.experience_years, data.about,
        data.certifications ? JSON.stringify(data.certifications) : null,
        data.languages ? JSON.stringify(data.languages) : null,
        data.areas_served ? JSON.stringify(data.areas_served) : null,
        data.response_time, data.response_rate,
        data.social_links ? JSON.stringify(data.social_links) : null,
        data.office_name, data.office_address, data.office_phone, data.office_email,
        data.office_hours ? JSON.stringify(data.office_hours) : null,
        data.is_active, data.is_verified,
        mlsMemberId
      ]
    );
    return rowToAgent(rows[0]);
  }

  const { rows } = await pool.query(
    `INSERT INTO agent_profiles (
      mls_member_id, user_id, name, email, phone, photo_url, role,
      brokerage, brokerage_mls_id, license_number, experience_years, about,
      certifications, languages, areas_served, response_time, response_rate,
      social_links, office_name, office_address, office_phone, office_email, office_hours,
      is_active, is_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    RETURNING ${AGENT_FIELDS}`,
    [
      mlsMemberId, data.user_id, data.name, data.email, data.phone, data.photo_url, data.role,
      data.brokerage, data.brokerage_mls_id, data.license_number, data.experience_years, data.about,
      data.certifications ? JSON.stringify(data.certifications) : JSON.stringify([]),
      data.languages ? JSON.stringify(data.languages) : JSON.stringify([]),
      data.areas_served ? JSON.stringify(data.areas_served) : JSON.stringify([]),
      data.response_time, data.response_rate,
      data.social_links ? JSON.stringify(data.social_links) : JSON.stringify({}),
      data.office_name, data.office_address, data.office_phone, data.office_email,
      data.office_hours ? JSON.stringify(data.office_hours) : JSON.stringify({}),
      data.is_active !== undefined ? data.is_active : true,
      data.is_verified || false,
    ]
  );
  return rowToAgent(rows[0]);
}

async function update(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!AGENT_FIELDS.includes(key) || key === 'id' || key === 'created_at' || key === 'updated_at') continue;
    if (['certifications', 'languages', 'areas_served'].includes(key) && Array.isArray(value)) {
      fields.push(`${key} = $${idx}::text[]`);
      values.push(JSON.stringify(value));
    } else if (['social_links', 'office_hours'].includes(key) && typeof value === 'object') {
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
    `UPDATE agent_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${AGENT_FIELDS}`,
    values
  );
  return rows.length ? rowToAgent(rows[0]) : null;
}

module.exports = {
  findById,
  findByMlsMemberId,
  findByUserId,
  search,
  upsert,
  update,
};
