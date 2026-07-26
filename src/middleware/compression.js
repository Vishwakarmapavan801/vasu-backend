/**
 * Response Compression Middleware
 *
 * Enables gzip/brotli compression for all API responses.
 * Significantly reduces payload sizes (typically 60-80% smaller).
 */
const compression = require('compression');

// Only compress responses larger than 1KB to avoid overhead on tiny payloads
const shouldCompress = (req, res) => {
  if (req.headers['x-no-compression']) {
    return false;
  }
  return compression.filter(req, res);
};

module.exports = compression({
  filter: shouldCompress,
  threshold: 1024, // 1KB minimum
  level: 6,        // Default compression level (1-9)
});
