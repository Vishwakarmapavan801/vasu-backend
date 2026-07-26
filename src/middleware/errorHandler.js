function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;

  // CRITICAL: Override Cache-Control on error responses.
  // The /api Cache-Control middleware runs BEFORE route handlers,
  // so it sets caching headers on ALL responses — including errors.
  // Without this override, browsers cache 500 error responses for 5
  // minutes, making the site appear broken long after the issue resolves.
  // Using 'no-store' ensures the browser NEVER caches an error response.
  try {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.removeHeader('Last-Modified');
    res.removeHeader('ETag');
  } catch (_) {}

  const response = {
    success: false,
    error: err.message || 'Internal Server Error',
  };

  if (err.response) {
    response.mlsStatus = err.response.status;
    response.mlsError = err.response.data?.error?.message || err.response.statusText;

    if (err.response.status === 401) {
      response.error = 'MLS Grid authentication failed. Check access token.';
    } else if (err.response.status === 403) {
      response.error = 'MLS Grid access forbidden.';
    } else if (err.response.status === 404) {
      response.error = 'Resource not found in MLS Grid.';
    } else if (err.response.status === 429) {
      response.error = 'MLS Grid rate limit exceeded. Please try again later.';
    } else if (err.response.status >= 500) {
      response.error = 'MLS Grid server error. Please try again later.';
    }
  } else if (err.code === 'ECONNABORTED') {
    response.error = 'MLS Grid request timed out. Please try again.';
    response.timeout = true;
  } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    response.error = 'Could not connect to MLS Grid. Check network and base URL.';
  }

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);

  return res.status(statusCode).json(response);
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
