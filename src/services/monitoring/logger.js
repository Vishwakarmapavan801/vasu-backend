const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../../../logs');

const levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    ),
  }),
];

if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  transports.push(
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error', maxSize: '20m', maxFiles: 14 }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'), maxSize: '20m', maxFiles: 30 }),
    new winston.transports.File({ filename: path.join(logDir, 'mls-sync.log'), level: 'info', maxSize: '20m', maxFiles: 7 })
  );
}

const logger = winston.createLogger({ level, levels, format, transports });

// Stream for Morgan HTTP request logging
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
