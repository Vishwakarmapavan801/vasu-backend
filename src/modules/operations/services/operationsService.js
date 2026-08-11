const pool = require('../../../config/database');

// ================================================================
// PROPERTY INQUIRIES
// ================================================================
async function createInquiry(data) {
  const { listing_key, agent_id, user_id, name, email, phone, preferred_contact, buyer_type, financing_status, timeline, message, source, campaign, referring_post_id, neighborhood, zip_code } = data;
  const { rows } = await pool.query(
    `INSERT INTO property_inquiries (listing_key, agent_id, user_id, name, email, phone, preferred_contact, buyer_type, financing_status, timeline, message, source, campaign, referring_post_id, neighborhood, zip_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [listing_key, agent_id, user_id, name, email, phone, preferred_contact, buyer_type, financing_status, timeline, message, source || 'property_page', campaign, referring_post_id, neighborhood, zip_code]
  );
  return rows[0];
}

async function getInquiries(query = {}) {
  const { limit = 50, offset = 0, status, listing_key } = query;
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`pi.status = $${params.length}`); }
  if (listing_key) { params.push(listing_key); conditions.push(`pi.listing_key = $${params.length}`); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT pi.*, a.name AS agent_name, a.email AS agent_email
     FROM property_inquiries pi LEFT JOIN agents a ON pi.agent_id = a.id
     ${where} ORDER BY pi.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM property_inquiries pi ${where}`, params);
  return { data: rows, total: parseInt(count), limit, offset };
}

async function getInquiry(id) {
  const { rows } = await pool.query(
    `SELECT pi.*, a.name AS agent_name, a.email AS agent_email
     FROM property_inquiries pi LEFT JOIN agents a ON pi.agent_id = a.id WHERE pi.id = $1`, [id]
  );
  return rows[0] || null;
}

// ================================================================
// TOUR SCHEDULES
// ================================================================
async function createTourSchedule(data) {
  const { listing_key, agent_id, user_id, name, email, phone, tour_type, tour_date, tour_time, timezone, duration_minutes, guests_count, notes, source } = data;
  const { rows } = await pool.query(
    `INSERT INTO tour_schedules (listing_key, agent_id, user_id, name, email, phone, tour_type, tour_date, tour_time, timezone, duration_minutes, guests_count, notes, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [listing_key, agent_id, user_id, name, email, phone, tour_type || 'in_person', tour_date, tour_time, timezone || 'America/New_York', duration_minutes || 30, guests_count || 1, notes, source || 'property_page']
  );
  return rows[0];
}

async function getTourSchedules(agentId, query = {}) {
  const { limit = 50, offset = 0, status, date_from, date_to } = query;
  const conditions = ['ts.agent_id = $1'];
  const params = [agentId];
  let idx = 1;
  if (status) { params.push(status); conditions.push(`ts.status = $${++idx}`); }
  if (date_from) { params.push(date_from); conditions.push(`ts.tour_date >= $${++idx}`); }
  if (date_to) { params.push(date_to); conditions.push(`ts.tour_date <= $${++idx}`); }
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await pool.query(
    `SELECT ts.* FROM tour_schedules ts ${where} ORDER BY ts.tour_date ASC, ts.tour_time ASC LIMIT $${++idx} OFFSET $${++idx}`,
    [...params, limit, offset]
  );
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM tour_schedules ts ${where}`, params);
  return { data: rows, total: parseInt(count), limit, offset };
}

async function updateTourSchedule(id, agentId, data) {
  const fields = [];
  const params = [id, agentId];
  let idx = 2;
  for (const [key, val] of Object.entries(data)) {
    if (['status', 'tour_date', 'tour_time', 'notes', 'confirmation_sent', 'reminder_sent', 'cancelled_at'].includes(key)) {
      fields.push(`${key} = $${++idx}`);
      params.push(val);
    }
  }
  if (!fields.length) return null;
  const { rows } = await pool.query(
    `UPDATE tour_schedules SET ${fields.join(', ')} WHERE id = $1 AND agent_id = $2 RETURNING *`, params
  );
  return rows[0] || null;
}

// ================================================================
// OFFER INQUIRIES
// ================================================================
async function createOfferInquiry(data) {
  const { listing_key, agent_id, user_id, name, email, phone, desired_price, financing_type, down_payment, down_payment_pct, contingencies, inspection_needed, closing_timeline, pre_approved, lender_name, message } = data;
  const { rows } = await pool.query(
    `INSERT INTO offer_inquiries (listing_key, agent_id, user_id, name, email, phone, desired_price, financing_type, down_payment, down_payment_pct, contingencies, inspection_needed, closing_timeline, pre_approved, lender_name, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [listing_key, agent_id, user_id, name, email, phone, desired_price, financing_type || 'loan', down_payment, down_payment_pct, contingencies || [], inspection_needed !== false, closing_timeline, pre_approved || false, lender_name, message]
  );
  return rows[0];
}

async function getOfferInquiries(agentId, query = {}) {
  const { limit = 50, offset = 0, status } = query;
  const conditions = ['oi.agent_id = $1'];
  const params = [agentId];
  let idx = 1;
  if (status) { params.push(status); conditions.push(`oi.status = $${++idx}`); }
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await pool.query(
    `SELECT oi.* FROM offer_inquiries oi ${where} ORDER BY oi.created_at DESC LIMIT $${++idx} OFFSET $${++idx}`,
    [...params, limit, offset]
  );
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM offer_inquiries oi ${where}`, params);
  return { data: rows, total: parseInt(count), limit, offset };
}

async function updateOfferInquiry(id, agentId, data) {
  const fields = [];
  const params = [id, agentId];
  let idx = 2;
  for (const [key, val] of Object.entries(data)) {
    if (['status', 'desired_price', 'financing_type', 'message', 'pre_approved'].includes(key)) {
      fields.push(`${key} = $${++idx}`);
      params.push(val);
    }
  }
  if (!fields.length) return null;
  const { rows } = await pool.query(
    `UPDATE offer_inquiries SET ${fields.join(', ')} WHERE id = $1 AND agent_id = $2 RETURNING *`, params
  );
  return rows[0] || null;
}

// ================================================================
// LEAD ATTRIBUTION
// ================================================================
async function createAttribution(data) {
  const { lead_id, touchpoint_type, source, source_detail, listing_key, user_id, session_id, referrer_url, campaign, metadata } = data;
  const { rows } = await pool.query(
    `INSERT INTO lead_attribution (lead_id, touchpoint_type, source, source_detail, listing_key, agent_id, user_id, session_id, referrer_url, campaign, touch_order, is_first_touch, is_last_touch, metadata)
     VALUES ($1, $2, $3, $4, $5, (SELECT agent_id FROM agent_leads WHERE id=$1), $6, $7, $8, $9,
       (SELECT COALESCE(MAX(touch_order), 0) + 1 FROM lead_attribution WHERE lead_id=$1),
       (SELECT COUNT(*) FROM lead_attribution WHERE lead_id=$1) = 0,
       FALSE, $10)
     RETURNING *`,
    [lead_id, touchpoint_type, source, source_detail, listing_key, user_id, session_id, referrer_url, campaign, metadata || {}]
  );
  return rows[0];
}

async function getAttribution(leadId) {
  const { rows } = await pool.query(
    'SELECT * FROM lead_attribution WHERE lead_id = $1 ORDER BY touch_order ASC', [leadId]
  );
  return rows;
}

// ================================================================
// TRANSACTIONS
// ================================================================
async function createTransaction(agentId, data) {
  const { lead_id, listing_key, transaction_type, offer_price, accepted_price, commission, commission_pct, status, earnest_money, earnest_money_due, inspection_date, closing_date, financing_type, loan_amount, title_company, notes, buyer_id, seller_id } = data;
  const { rows } = await pool.query(
    `INSERT INTO transactions (lead_id, listing_key, agent_id, buyer_id, seller_id, transaction_type, offer_price, accepted_price, commission, commission_pct, status, earnest_money, earnest_money_due, inspection_date, closing_date, financing_type, loan_amount, title_company, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [lead_id, listing_key, agentId, buyer_id, seller_id, transaction_type || 'buy', offer_price, accepted_price, commission, commission_pct, status || 'offer', earnest_money, earnest_money_due, inspection_date, closing_date, financing_type, loan_amount, title_company, notes]
  );
  return rows[0];
}

async function getTransactions(agentId, query = {}) {
  const { limit = 50, offset = 0, status, transaction_type } = query;
  const conditions = ['t.agent_id = $1'];
  const params = [agentId];
  let idx = 1;
  if (status) { params.push(status); conditions.push(`t.status = $${++idx}`); }
  if (transaction_type) { params.push(transaction_type); conditions.push(`t.transaction_type = $${++idx}`); }
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await pool.query(
    `SELECT t.*, al.name AS lead_name, al.email AS lead_email
     FROM transactions t LEFT JOIN agent_leads al ON t.lead_id = al.id
     ${where} ORDER BY t.created_at DESC LIMIT $${++idx} OFFSET $${++idx}`,
    [...params, limit, offset]
  );
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM transactions t ${where}`, params);
  return { data: rows, total: parseInt(count), limit, offset };
}

async function getTransaction(id, agentId) {
  const { rows } = await pool.query(
    `SELECT t.*, al.name AS lead_name, al.email AS lead_email
     FROM transactions t LEFT JOIN agent_leads al ON t.lead_id = al.id
     WHERE t.id = $1 AND t.agent_id = $2`, [id, agentId]
  );
  return rows[0] || null;
}

async function updateTransaction(id, agentId, data) {
  const fields = [];
  const params = [id, agentId];
  let idx = 2;
  const allowed = ['status','offer_price','accepted_price','commission','commission_pct','earnest_money','earnest_money_due','inspection_date','inspection_passed','appraisal_date','appraisal_value','financing_type','loan_amount','loan_approved','title_company','escrow_company','closing_date','possession_date','closing_costs','notes'];
  for (const [key, val] of Object.entries(data)) {
    if (allowed.includes(key)) { fields.push(`${key} = $${++idx}`); params.push(val); }
  }
  if (!fields.length) return null;
  const { rows } = await pool.query(
    `UPDATE transactions SET ${fields.join(', ')} WHERE id = $1 AND agent_id = $2 RETURNING *`, params
  );
  return rows[0] || null;
}

async function deleteTransaction(id, agentId) {
  const { rowCount } = await pool.query('DELETE FROM transactions WHERE id = $1 AND agent_id = $2', [id, agentId]);
  return rowCount > 0;
}

// Transaction Milestones
async function getMilestones(transactionId) {
  const { rows } = await pool.query('SELECT * FROM transaction_milestones WHERE transaction_id = $1 ORDER BY due_date ASC NULLS LAST', [transactionId]);
  return rows;
}

async function createMilestone(transactionId, data) {
  const { milestone_type, title, description, due_date, is_automated } = data;
  const { rows } = await pool.query(
    `INSERT INTO transaction_milestones (transaction_id, milestone_type, title, description, due_date, is_automated)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [transactionId, milestone_type, title, description, due_date, is_automated || false]
  );
  return rows[0];
}

async function updateMilestone(id, data) {
  const { completed_at, description, due_date } = data;
  const { rows } = await pool.query(
    `UPDATE transaction_milestones SET completed_at = COALESCE($2, completed_at), description = COALESCE($3, description), due_date = COALESCE($4, due_date) WHERE id = $1 RETURNING *`,
    [id, completed_at, description, due_date]
  );
  return rows[0] || null;
}

// Transaction Documents
async function getDocuments(transactionId) {
  const { rows } = await pool.query('SELECT * FROM transaction_documents WHERE transaction_id = $1 ORDER BY created_at DESC', [transactionId]);
  return rows;
}

async function createDocument(transactionId, data, userId) {
  const { document_type, title, file_url, file_size, mime_type } = data;
  const { rows } = await pool.query(
    `INSERT INTO transaction_documents (transaction_id, document_type, title, file_url, file_size, mime_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [transactionId, document_type, title, file_url, file_size, mime_type, userId]
  );
  return rows[0];
}

async function deleteDocument(id) {
  const { rowCount } = await pool.query('DELETE FROM transaction_documents WHERE id = $1', [id]);
  return rowCount > 0;
}

// Attribution-based lead creation (consumer→lead conversion)
async function createLeadFromInquiry(inquiryId) {
  const inquiry = await getInquiry(inquiryId);
  if (!inquiry) return null;
  const { rows: [existing] } = await pool.query('SELECT id FROM agent_leads WHERE inquiry_id = $1', [inquiryId]);
  if (existing) return existing;

  const { rows } = await pool.query(
    `INSERT INTO agent_leads (agent_id, user_id, name, email, phone, source, status, lead_type, listing_key, listing_address, inquiry_id, inquiry_source, first_contacted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', 'buyer', $7, (SELECT property_address FROM property_inquiries WHERE id=$8), $8, $9, NOW())
     ON CONFLICT DO NOTHING RETURNING *`,
    [inquiry.agent_id, inquiry.user_id, inquiry.name, inquiry.email, inquiry.phone, inquiry.source || 'property_page', inquiry.listing_key, inquiryId, inquiry.source]
  );
  return rows[0] || null;
}

// Dashboard
async function getOperationsDashboard(agentId) {
  const [inquiries, tours, offers, transactions] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'30 days\')::int AS recent FROM property_inquiries WHERE agent_id = $1', [agentId]),
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = \'pending\')::int AS pending FROM tour_schedules WHERE agent_id = $1', [agentId]),
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = \'pending\')::int AS pending FROM offer_inquiries WHERE agent_id = $1', [agentId]),
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status NOT IN (\'closed\',\'cancelled\'))::int AS active FROM transactions WHERE agent_id = $1', [agentId]),
  ]);
  return {
    inquiries: inquiries.rows[0],
    tours: tours.rows[0],
    offers: offers.rows[0],
    transactions: transactions.rows[0],
  };
}

module.exports = {
  createInquiry, getInquiries, getInquiry,
  createTourSchedule, getTourSchedules, updateTourSchedule,
  createOfferInquiry, getOfferInquiries, updateOfferInquiry,
  createAttribution, getAttribution,
  createTransaction, getTransactions, getTransaction, updateTransaction, deleteTransaction,
  getMilestones, createMilestone, updateMilestone,
  getDocuments, createDocument, deleteDocument,
  createLeadFromInquiry, getOperationsDashboard,
};
