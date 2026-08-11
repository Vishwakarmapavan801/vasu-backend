/**
 * Pre-Approval Routes
 *
 * POST handler is now managed by formRoutes (/api/pre-approval) with PostgreSQL storage.
 * This file provides read-only GET endpoints that query the database.
 * Kept for backward compatibility with existing GET calls.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const preApprovalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

router.post('/', (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'POST is no longer supported on this endpoint. Use /api/pre-approval instead.',
  });
});

router.get('/', requireAuth, preApprovalLimiter, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 50);
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      'SELECT * FROM mortgage_pre_approvals ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, preApprovalLimiter, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM mortgage_pre_approvals WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
