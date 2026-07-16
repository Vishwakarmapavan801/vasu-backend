/**
 * Logger Utility
 *
 * Provides structured logging with timestamps and log levels.
 * Used for MLS API request/response tracking and error reporting.
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] !== undefined
  ? LOG_LEVELS[process.env.LOG_LEVEL]
  : LOG_LEVELS.info;

/**
 * Format a log entry with timestamp and structured metadata
 */
function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...meta };
  return entry;
}

/**
 * Check if the given log level is enabled
 */
function isEnabled(level) {
  return LOG_LEVELS[level] !== undefined && LOG_LEVELS[level] <= CURRENT_LEVEL;
}

const logger = {
  error(message, meta = {}) {
    if (isEnabled('error')) {
      const entry = formatLog('error', message, meta);
      console.error(JSON.stringify(entry));
    }
  },

  warn(message, meta = {}) {
    if (isEnabled('warn')) {
      const entry = formatLog('warn', message, meta);
      console.warn(JSON.stringify(entry));
    }
  },

  info(message, meta = {}) {
    if (isEnabled('info')) {
      const entry = formatLog('info', message, meta);
      console.log(JSON.stringify(entry));
    }
  },

  debug(message, meta = {}) {
    if (isEnabled('debug')) {
      const entry = formatLog('debug', message, meta);
      console.log(JSON.stringify(entry));
    }
  },

  /**
   * Create a request-scoped logger that automatically includes request metadata
   * @param {Object} req - Express request object
   * @returns {Object} Logger with bound request context
   */
  forRequest(req) {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const context = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.connection?.remoteAddress,
    };

    const boundLogger = {};
    for (const level of Object.keys(LOG_LEVELS)) {
      boundLogger[level] = (message, meta = {}) => {
        logger[level](message, { ...context, ...meta });
      };
    }
    return boundLogger;
  },
};

module.exports = logger;
