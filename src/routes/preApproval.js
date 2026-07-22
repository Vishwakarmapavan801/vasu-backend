/**
 * Pre-Approval Routes
 *
 * POST handler is now managed by formRoutes (/api/pre-approval) with PostgreSQL storage.
 * This file provides read-only GET endpoints that query the database.
 * Kept for backward compatibility with existing GET calls.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.post('/', (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'POST is no longer supported on this endpoint. Use /api/pre-approval instead.',
  });
});

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM mortgage_pre_approvals ORDER BY created_at DESC'
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

router.get('/:id', async (req, res, next) => {
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
