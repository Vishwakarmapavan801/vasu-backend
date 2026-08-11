const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../middleware/asyncHandler');
const { requireAuth } = require('../../../middleware/auth');
const pool = require('../../../config/database');
const ctrl = require('../controllers/crmController');

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: () => process.env.NODE_ENV !== 'production' });

async function resolveAgent(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id FROM agents WHERE user_id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Agent profile not found' });
    req.agentId = rows[0].id;
    next();
  } catch (err) { next(err); }
}

router.use(requireAuth, resolveAgent);

router.get('/crm/leads', authLimiter, asyncHandler(ctrl.getLeads));
router.get('/crm/leads/stats', authLimiter, asyncHandler(ctrl.getLeadStats));
router.get('/crm/leads/pipeline', authLimiter, asyncHandler(ctrl.getPipeline));
router.get('/crm/leads/:id', authLimiter, asyncHandler(ctrl.getLead));
router.post('/crm/leads', authLimiter, asyncHandler(ctrl.createLead));
router.patch('/crm/leads/:id', authLimiter, asyncHandler(ctrl.updateLead));
router.delete('/crm/leads/:id', authLimiter, asyncHandler(ctrl.deleteLead));
router.get('/crm/leads/:id/notes', authLimiter, asyncHandler(ctrl.getLeadNotes));
router.post('/crm/leads/:id/notes', authLimiter, asyncHandler(ctrl.createLeadNote));
router.get('/crm/tasks', authLimiter, asyncHandler(ctrl.getLeadTasks));
router.post('/crm/tasks', authLimiter, asyncHandler(ctrl.createLeadTask));
router.patch('/crm/tasks/:id', authLimiter, asyncHandler(ctrl.updateLeadTask));
router.delete('/crm/tasks/:id', authLimiter, asyncHandler(ctrl.deleteLeadTask));
router.get('/crm/dashboard', authLimiter, asyncHandler(ctrl.getCRMDashboard));

module.exports = router;
