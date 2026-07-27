const NODE_ENV = process.env.NODE_ENV || 'development';

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL
  ? (LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] ?? 2)
  : (NODE_ENV === 'production' ? 2 : 3);

function serializeError(err) {
  if (!err) return null;
  return {
    message: err.message || String(err),
    code: err.code || null,
    status: err.status || err.statusCode || null,
    stack: NODE_ENV === 'development' ? (err.stack || '').split('\n').slice(0, 6).join('\n') : undefined,
  };
}

function log(level, levelName, message, meta = {}) {
  if (LOG_LEVELS[level] > CURRENT_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level: levelName,
    message,
    ...meta,
  };

  if (meta.error) {
    entry.error = serializeError(meta.error);
    delete meta.error;
  }

  const line = JSON.stringify(entry);

  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

const logger = {
  error(message, meta) { log('error', 'error', message, meta); },
  warn(message, meta) { log('warn', 'warn', message, meta); },
  info(message, meta) { log('info', 'info', message, meta); },
  debug(message, meta) { log('debug', 'debug', message, meta); },
};

module.exports = logger;
