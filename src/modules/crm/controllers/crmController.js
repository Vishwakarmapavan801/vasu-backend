const crmService = require('../services/crmService');

async function getLeads(req, res, next) {
  try { const result = await crmService.getLeads(req.agentId, req.query); return res.status(200).json({ success: true, ...result }); }
  catch (err) { next(err); }
}

async function getLead(req, res, next) {
  try { const data = await crmService.getLead(req.params.id, req.agentId); if (!data) return res.status(404).json({ success: false, error: 'Lead not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function createLead(req, res, next) {
  try { const data = await crmService.createLead(req.agentId, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function updateLead(req, res, next) {
  try { const data = await crmService.updateLead(req.params.id, req.agentId, req.body); if (!data) return res.status(404).json({ success: false, error: 'Lead not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function deleteLead(req, res, next) {
  try { const ok = await crmService.deleteLead(req.params.id, req.agentId); if (!ok) return res.status(404).json({ success: false, error: 'Lead not found' }); return res.status(200).json({ success: true, message: 'Deleted' }); }
  catch (err) { next(err); }
}

async function getLeadStats(req, res, next) {
  try { const data = await crmService.getLeadStats(req.agentId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function getPipeline(req, res, next) {
  try { const data = await crmService.getPipeline(req.agentId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Notes
async function getLeadNotes(req, res, next) {
  try { const data = await crmService.getLeadNotes(req.params.id, req.agentId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function createLeadNote(req, res, next) {
  try { const data = await crmService.createLeadNote(req.params.id, req.agentId, req.body.content, req.body.note_type); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

// Tasks
async function getLeadTasks(req, res, next) {
  try { const data = await crmService.getLeadTasks(req.agentId, req.query); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function createLeadTask(req, res, next) {
  try { const data = await crmService.createLeadTask(req.body.lead_id, req.agentId, req.body); return res.status(201).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function updateLeadTask(req, res, next) {
  try { const data = await crmService.updateLeadTask(req.params.id, req.agentId, req.body); if (!data) return res.status(404).json({ success: false, error: 'Task not found' }); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

async function deleteLeadTask(req, res, next) {
  try { const ok = await crmService.deleteLeadTask(req.params.id, req.agentId); if (!ok) return res.status(404).json({ success: false, error: 'Task not found' }); return res.status(200).json({ success: true, message: 'Deleted' }); }
  catch (err) { next(err); }
}

async function getCRMDashboard(req, res, next) {
  try { const data = await crmService.getCRMDashboard(req.agentId); return res.status(200).json({ success: true, data }); }
  catch (err) { next(err); }
}

module.exports = { getLeads, getLead, createLead, updateLead, deleteLead, getLeadStats, getPipeline, getLeadNotes, createLeadNote, getLeadTasks, createLeadTask, updateLeadTask, deleteLeadTask, getCRMDashboard };
