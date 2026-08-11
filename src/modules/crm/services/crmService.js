const pool = require('../../../config/database');

// === Leads ===
async function getLeads(agentId, params) {
  const { status, lead_type, source, search, limit = 50, offset = 0 } = params;
  const conditions = [`agent_id = $1`]; const vals = [agentId]; let idx = 2;
  if (status) { conditions.push(`status = $${idx++}`); vals.push(status); }
  if (lead_type) { conditions.push(`lead_type = $${idx++}`); vals.push(lead_type); }
  if (source) { conditions.push(`source = $${idx++}`); vals.push(source); }
  if (search) { conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`); vals.push(`%${search}%`); idx++; }
  const { rows, rowCount } = await pool.query(`SELECT *, (SELECT COUNT(*) FROM lead_tasks WHERE lead_id = agent_leads.id AND status = 'pending') AS pending_tasks FROM agent_leads WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, limit, offset]);
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM agent_leads WHERE ${conditions.join(' AND ')}`, vals.slice(0, -2));
  return { data: rows, total: parseInt(countRows[0].count) };
}

async function getLead(id, agentId) {
  const { rows } = await pool.query('SELECT * FROM agent_leads WHERE id = $1 AND agent_id = $2', [id, agentId]);
  return rows[0] || null;
}

async function createLead(agentId, data) {
  const { name, email, phone, source, lead_type, budget_min, budget_max, property_type, city_interest, bedrooms_min, bathrooms_min, listing_key, listing_address, notes_summary } = data;
  const { rows } = await pool.query(`INSERT INTO agent_leads (agent_id, name, email, phone, source, lead_type, budget_min, budget_max, property_type, city_interest, bedrooms_min, bathrooms_min, listing_key, listing_address, notes_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [agentId, name, email, phone, source || 'direct', lead_type || 'buyer', budget_min, budget_max, property_type, city_interest, bedrooms_min, bathrooms_min, listing_key, listing_address, notes_summary]);
  await trackPipeline(rows[0].id, agentId, 'new');
  return rows[0];
}

async function updateLead(id, agentId, data) {
  const fields = []; const vals = []; let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (['name', 'email', 'phone', 'source', 'status', 'lead_type', 'budget_min', 'budget_max', 'property_type', 'city_interest', 'bedrooms_min', 'bathrooms_min', 'notes_summary', 'listing_key', 'listing_address', 'first_contacted_at', 'last_contacted_at'].includes(key)) {
      fields.push(`${key} = $${idx++}`); vals.push(val);
    }
  }
  if (!fields.length) return null;
  if (data.status) await trackPipeline(id, agentId, data.status);
  vals.push(id, agentId);
  const { rows } = await pool.query(`UPDATE agent_leads SET ${fields.join(', ')} WHERE id = $${idx++} AND agent_id = $${idx++} RETURNING *`, [...vals, id, agentId]);
  return rows[0] || null;
}

async function deleteLead(id, agentId) {
  const { rowCount } = await pool.query('DELETE FROM agent_leads WHERE id = $1 AND agent_id = $2', [id, agentId]);
  return rowCount > 0;
}

async function getLeadStats(agentId) {
  const { rows } = await pool.query(`SELECT status, COUNT(*)::int AS count FROM agent_leads WHERE agent_id = $1 GROUP BY status`, [agentId]);
  const stats = { new: 0, contacted: 0, qualified: 0, showing: 0, offer: 0, under_contract: 0, closed: 0, lost: 0, total: 0 };
  rows.forEach(r => { if (stats[r.status] !== undefined) stats[r.status] = r.count; stats.total += r.count; });
  return stats;
}

// === Pipeline ===
async function trackPipeline(leadId, agentId, stage) {
  const { rows } = await pool.query("UPDATE lead_pipeline SET exited_at = NOW() WHERE lead_id = $1 AND exited_at IS NULL", [leadId]);
  await pool.query("INSERT INTO lead_pipeline (lead_id, agent_id, stage, previous_stage) VALUES ($1,$2,$3,(SELECT stage FROM lead_pipeline WHERE lead_id = $1 ORDER BY entered_at DESC LIMIT 1))", [leadId, agentId, stage]);
}

async function getPipeline(agentId) {
  const { rows } = await pool.query(`SELECT DISTINCT ON (lp.lead_id) lp.*, l.name AS lead_name, l.email AS lead_email, l.phone AS lead_phone, l.source, l.lead_type FROM lead_pipeline lp JOIN agent_leads l ON l.id = lp.lead_id WHERE lp.agent_id = $1 ORDER BY lp.lead_id, lp.entered_at DESC`, [agentId]);
  return rows;
}

// === Notes ===
async function getLeadNotes(leadId, agentId) {
  const { rows } = await pool.query('SELECT * FROM lead_notes WHERE lead_id = $1 AND agent_id = $2 ORDER BY created_at DESC', [leadId, agentId]);
  return rows;
}

async function createLeadNote(leadId, agentId, content, noteType = 'general') {
  const { rows } = await pool.query('INSERT INTO lead_notes (lead_id, agent_id, content, note_type) VALUES ($1,$2,$3,$4) RETURNING *', [leadId, agentId, content, noteType]);
  return rows[0];
}

// === Tasks ===
async function getLeadTasks(agentId, params) {
  const { status, priority, lead_id, limit = 50, offset = 0 } = params;
  const conditions = [`agent_id = $1`]; const vals = [agentId]; let idx = 2;
  if (status) { conditions.push(`status = $${idx++}`); vals.push(status); }
  if (priority) { conditions.push(`priority = $${idx++}`); vals.push(priority); }
  if (lead_id) { conditions.push(`lead_id = $${idx++}`); vals.push(lead_id); }
  const { rows } = await pool.query(`SELECT lt.*, l.name AS lead_name FROM lead_tasks lt LEFT JOIN agent_leads l ON l.id = lt.lead_id WHERE ${conditions.join(' AND ')} ORDER BY due_at ASC NULLS LAST, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...vals, limit, offset]);
  return rows;
}

async function createLeadTask(leadId, agentId, data) {
  const { title, description, task_type, priority, due_at } = data;
  const { rows } = await pool.query('INSERT INTO lead_tasks (lead_id, agent_id, title, description, task_type, priority, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [leadId, agentId, title, description, task_type || 'follow_up', priority || 'medium', due_at]);
  return rows[0];
}

async function updateLeadTask(id, agentId, data) {
  const fields = []; const vals = []; let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (['title', 'description', 'task_type', 'priority', 'status', 'due_at'].includes(key)) {
      fields.push(`${key} = $${idx++}`); vals.push(val);
    }
  }
  if (data.status === 'completed') { fields.push(`completed_at = $${idx++}`); vals.push(new Date()); }
  if (!fields.length) return null;
  vals.push(id, agentId);
  const { rows } = await pool.query(`UPDATE lead_tasks SET ${fields.join(', ')} WHERE id = $${idx++} AND agent_id = $${idx++} RETURNING *`, [...vals, id, agentId]);
  return rows[0] || null;
}

async function deleteLeadTask(id, agentId) {
  const { rowCount } = await pool.query('DELETE FROM lead_tasks WHERE id = $1 AND agent_id = $2', [id, agentId]);
  return rowCount > 0;
}

// === Dashboard ===
async function getCRMDashboard(agentId) {
  const stats = await getLeadStats(agentId);
  const { rows: recentLeads } = await pool.query('SELECT id, name, email, source, status, lead_type, created_at FROM agent_leads WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10', [agentId]);
  const { rows: pendingTasks } = await pool.query('SELECT lt.*, l.name AS lead_name FROM lead_tasks lt LEFT JOIN agent_leads l ON l.id = lt.lead_id WHERE lt.agent_id = $1 AND lt.status = $2 ORDER BY lt.due_at ASC LIMIT 10', [agentId, 'pending']);
  const { rows: pipelineStages } = await pool.query(`SELECT stage, COUNT(*)::int AS count, MAX(lp.entered_at) AS latest FROM lead_pipeline lp JOIN (SELECT lead_id, MAX(entered_at) AS max_entered FROM lead_pipeline WHERE agent_id = $1 GROUP BY lead_id) latest ON lp.lead_id = latest.lead_id AND lp.entered_at = latest.max_entered GROUP BY stage ORDER BY count DESC`, [agentId]);
  return { stats, recentLeads, pendingTasks, pipelineStages };
}

module.exports = { getLeads, getLead, createLead, updateLead, deleteLead, getLeadStats, getPipeline, getLeadNotes, createLeadNote, getLeadTasks, createLeadTask, updateLeadTask, deleteLeadTask, getCRMDashboard };
