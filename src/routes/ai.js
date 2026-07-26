

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { processSearchRequest } = require('../services/aiSearchService');
const { OPENAI_API_KEY } = require('../config');


const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many AI requests. Please wait before sending another message.' },
  skip: (req) => {
    // Bypass rate limit in development for easier testing
    return process.env.NODE_ENV === 'development';
  },
});


function validateMessage(req, res, next) {
  const { message } = req.body;

  // Check message exists
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Please provide a message.',
    });
  }

  const trimmed = message.trim();

  // Check empty after trim
  if (!trimmed) {
    return res.status(400).json({
      success: false,
      error: 'Message cannot be empty.',
    });
  }

  // Check max length (2000 chars)
  if (trimmed.length > 2000) {
    return res.status(400).json({
      success: false,
      error: 'Message is too long. Please keep it under 2000 characters.',
    });
  }

  // Check for OpenAI API key configuration
  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'AI assistant is not configured. Please contact support.',
    });
  }

  // Sanitize: store sanitized message
  req.sanitizedMessage = trimmed
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .slice(0, 2000);          // Enforce max length

  next();
}

/**
 * POST /api/ai/chat
 *
 * Accepts a natural language message, processes it through the AI pipeline,
 * and returns a response with matching properties.
 */
router.post('/chat', aiLimiter, validateMessage, async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { reply, properties } = await processSearchRequest(req.sanitizedMessage);

    const elapsed = Date.now() - startTime;

    console.log(`[AI Chat] "${req.sanitizedMessage.slice(0, 60)}..." → ${properties.length} results in ${elapsed}ms`);

    return res.json({
      success: true,
      reply,
      properties,
      meta: {
        elapsed,
        resultCount: properties.length,
      },
    });
  } catch (err) {
    console.error('[AI Chat] Unexpected error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    });
  }
});

module.exports = router;
