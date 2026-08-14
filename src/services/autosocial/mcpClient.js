/**
 * AutoSocial MCP Client
 *
 * JSON-RPC 2.0 client for the AutoSocial MCP live snapshot / market-data
 * service (Model Context Protocol over HTTP with SSE responses).
 *
 * Authentication — every HTTP request is HMAC-signed exactly as specified:
 *
 *   signature = HMAC_SHA256(key = SHA256(HMAC_SECRET),
 *                          data = "{timestamp}.{rawRequestBody}")
 *
 * Headers sent on every request:
 *   X-AutoSocial-Key   — API key (env AUTOSOCIAL_API_KEY)
 *   X-Timestamp        — epoch seconds (spec header)
 *   X-MCP-Timestamp    — epoch seconds (server-required header)
 *   X-MCP-Signature    — hex HMAC signature above
 *   X-Correlation-ID   — per-request correlation id
 *
 * The HMAC secret NEVER leaves the backend — it is only read from the
 * environment (AUTOSOCIAL_HMAC_SECRET) to derive the signing key.
 *
 * Session: MCP requires an `initialize` handshake; the returned
 * `Mcp-Session-Id` header is cached and re-sent on every call. If the
 * session expires the client re-initializes transparently and retries once.
 *
 * Workflow functions (used by blog generation):
 *   fetchLiveSnapshot()           → getPropertyPortfolioAnalytics
 *   fetchListings()               → getZipFarmingProperties
 *   fetchNeighborhoodInsights()   → query_hyperlocal_intelligence
 *   fetchMarketStats()            → getPropertyPortfolioAnalytics (sold)
 *   fetchRecentActivity()         → get-platform-comments
 *
 * Features: retries with exponential backoff (transient failures only),
 * request timeouts, structured errors (MCPError), correlation logging, and
 * graceful "not configured" failures.
 */

const crypto = require('crypto');
const axios = require('axios');
const {
  AUTOSOCIAL_MCP_BASE_URL,
  AUTOSOCIAL_API_KEY,
  AUTOSOCIAL_HMAC_SECRET,
  AUTOSOCIAL_ORG_ID,
  AUTOSOCIAL_MCP_TIMEOUT_MS,
  AUTOSOCIAL_MCP_MAX_RETRIES,
  AUTOSOCIAL_SIGNATURE_ENCODING,
  AUTOSOCIAL_TIMESTAMP_UNIT,
  AUTOSOCIAL_MCP_PROTOCOL_VERSION,
} = require('../../config');
const logger = require('../monitoring/logger');

class MCPError extends Error {
  constructor(message, { code = 'MCP_ERROR', status, retries = 0, cause, correlationId } = {}) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.status = status;
    this.retries = retries;
    this.cause = cause;
    this.correlationId = correlationId;
  }
}

const MCP_PROTOCOL_VERSION = AUTOSOCIAL_MCP_PROTOCOL_VERSION || '2024-11-05';

let sessionId = null;
let rpcId = 0;
let sessionInitPromise = null;

// ============================================================
// configuration
// ============================================================

function getConfigStatus() {
  const missing = [];
  if (!AUTOSOCIAL_MCP_BASE_URL) missing.push('AUTOSOCIAL_MCP_BASE_URL');
  if (!AUTOSOCIAL_API_KEY) missing.push('AUTOSOCIAL_API_KEY');
  if (!AUTOSOCIAL_HMAC_SECRET) missing.push('AUTOSOCIAL_HMAC_SECRET');
  return {
    configured: missing.length === 0,
    missing,
    baseUrl: AUTOSOCIAL_MCP_BASE_URL || null,
    orgIdConfigured: Boolean(AUTOSOCIAL_ORG_ID),
  };
}

function assertConfigured() {
  const status = getConfigStatus();
  if (!status.configured) {
    throw new MCPError(
      `AutoSocial MCP is not configured. Missing env vars: ${status.missing.join(', ')}`,
      { code: 'MCP_NOT_CONFIGURED' }
    );
  }
}

/**
 * Live connectivity + authentication check. Calls the signed /health
 * endpoint; a 200 proves the signature and API key are accepted.
 */
async function getMcpStatus() {
  const config = getConfigStatus();
  if (!config.configured) {
    return { ...config, connectivity: 'not-configured', authenticated: false, checkedAt: new Date().toISOString() };
  }
  try {
    const response = await signedRequest({
      method: 'GET',
      path: '/health',
      rawRequestBody: '',
      functionName: 'mcp-status',
      retries: 1,
    });
    const ok = response && response.status === 'ok';
    return {
      ...config,
      connectivity: ok ? 'ok' : 'degraded',
      authenticated: true,
      service: response && response.service,
      tools: response && response.tools,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ...config,
      connectivity: 'error',
      authenticated: err.code === 'MCP_AUTH_FAILED' ? false : undefined,
      error: err.message,
      correlationId: err.correlationId,
      checkedAt: new Date().toISOString(),
    };
  }
}

// ============================================================
// HMAC signing
// ============================================================

function currentTimestamp() {
  const now = Date.now();
  return AUTOSOCIAL_TIMESTAMP_UNIT === 'ms' ? String(now) : String(Math.floor(now / 1000));
}

function buildSignature({ timestamp, rawRequestBody, secret = AUTOSOCIAL_HMAC_SECRET }) {
  const key = crypto.createHash('sha256').update(secret, 'utf8').digest();
  const data = `${timestamp}.${rawRequestBody}`;
  const encoding = AUTOSOCIAL_SIGNATURE_ENCODING === 'base64' ? 'base64' : 'hex';
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding);
}

function buildHeaders(rawRequestBody, timestamp, correlationId) {
  const headers = {
    'X-AutoSocial-Key': AUTOSOCIAL_API_KEY,
    'X-Timestamp': timestamp,
    'X-MCP-Timestamp': timestamp,
    'X-MCP-Signature': buildSignature({ timestamp, rawRequestBody }),
    'X-Correlation-ID': correlationId,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (AUTOSOCIAL_ORG_ID) {
    headers['X-Org-Id'] = AUTOSOCIAL_ORG_ID;
  }
  return headers;
}

// ============================================================
// low-level signed HTTP
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncatePayload(data, maxLen = 400) {
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str && str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
  } catch {
    return null;
  }
}

function normalizeError(err, correlationId) {
  const status = err.response?.status;
  const data = err.response?.data;
  const message =
    (data && (data.error || data.message)) ||
    (err.response && `HTTP ${status}`) ||
    err.message ||
    'Unknown MCP error';

  if (status === 401 || status === 403) {
    return new MCPError('AutoSocial MCP rejected the request signature or API key.', {
      code: 'MCP_AUTH_FAILED', status, cause: err, correlationId,
    });
  }
  if (status === 429) {
    return new MCPError('AutoSocial MCP rate limit exceeded.', { code: 'MCP_RATE_LIMITED', status, cause: err, correlationId });
  }
  if (err.code === 'ECONNABORTED') {
    return new MCPError(`AutoSocial MCP request timed out after ${AUTOSOCIAL_MCP_TIMEOUT_MS}ms.`, {
      code: 'MCP_TIMEOUT', status, cause: err, correlationId,
    });
  }
  if (!err.response && err.request) {
    return new MCPError('AutoSocial MCP is unreachable.', { code: 'MCP_UNREACHABLE', cause: err, correlationId });
  }
  return new MCPError(message, { code: 'MCP_ERROR', status, cause: err, correlationId });
}

function isRetryable(err) {
  const status = err.status;
  if (status >= 500) return true;
  if (status === 429) return true;
  if (err.code === 'ECONNABORTED' || err.code === 'MCP_TIMEOUT' || err.code === 'MCP_UNREACHABLE') return true;
  return false;
}

/**
 * Perform an HMAC-signed HTTP request to the MCP server. The raw body is
 * serialized once and used for BOTH the signature and the transmitted bytes.
 * Supports JSON and SSE (text/event-stream) response bodies.
 */
async function signedRequest({ method = 'POST', path = '', rawRequestBody = '', functionName = 'mcp', retries = AUTOSOCIAL_MCP_MAX_RETRIES, extraHeaders = {} }) {
  assertConfigured();

  const correlationId = `mcpreq-${crypto.randomBytes(6).toString('hex')}`;
  const timestamp = currentTimestamp();
  const base = AUTOSOCIAL_MCP_BASE_URL.replace(/\/+$/, '');
  const url = path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    attempt += 1;
    const startedAt = Date.now();
    try {
      logger.info(`autosocial mcp: ${functionName} request`, {
        correlationId, path: path || '/', method, attempt, timestamp,
        requestBody: truncatePayload(rawRequestBody),
      });

      const response = await axios({
        method,
        url,
        timeout: AUTOSOCIAL_MCP_TIMEOUT_MS,
        headers: { ...buildHeaders(rawRequestBody, timestamp, correlationId), ...extraHeaders },
        data: method === 'GET' ? undefined : rawRequestBody,
        responseType: 'text',
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      // MCP session id comes back on the initialize handshake.
      const newSession = response.headers['mcp-session-id'];
      if (newSession) sessionId = newSession;

      const body = parseResponseBody(response.data);
      logger.info(`autosocial mcp: ${functionName} ok`, {
        correlationId, path: path || '/', attempt,
        durationMs: Date.now() - startedAt, status: response.status,
        responseBody: truncatePayload(body),
      });
      return body;
    } catch (err) {
      lastError = normalizeError(err, correlationId);

      if (attempt > retries || !isRetryable(lastError)) {
        logger.error(`autosocial mcp: ${functionName} failed`, {
          correlationId, path: path || '/', attempt,
          code: lastError.code, message: lastError.message,
          durationMs: Date.now() - startedAt,
        });
        lastError.retries = attempt - 1;
        throw lastError;
      }

      const backoff = Math.min(1000 * 2 ** (attempt - 1), 15000);
      logger.warn(`autosocial mcp: ${functionName} retrying`, {
        correlationId, path: path || '/', attempt, nextInMs: backoff, code: lastError.code,
      });
      await sleep(backoff);
    }
  }
  throw lastError;
}

/** Parse a JSON or SSE response body into a JSON object (or raw text). */
function parseResponseBody(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object') return raw;
  const text = String(raw);

  // SSE: one or more `data: {...}` lines.
  const dataLines = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      if (payload) {
        try { dataLines.push(JSON.parse(payload)); } catch { /* keep raw */ }
      }
    }
  }
  if (dataLines.length) return dataLines.length === 1 ? dataLines[0] : dataLines;

  // Plain JSON.
  try { return JSON.parse(text); } catch { /* fall through */ }
  return text;
}

// ============================================================
// JSON-RPC session + calls
// ============================================================

function isSessionError(err) {
  const code = err && (err.rpcCode || err.cause?.rpcCode);
  return code === -32000 || /session/i.test(err.message || '');
}

function extractRpcError(payload, correlationId) {
  if (!payload) return null;
  if (payload.error) {
    const err = new MCPError(payload.error.message || 'AutoSocial MCP request failed', {
      code: payload.error.code === -32600 || payload.error.code === -32000 ? 'MCP_SESSION_ERROR' : 'MCP_RPC_ERROR',
      status: payload.error.code,
      correlationId,
    });
    err.rpcCode = payload.error.code;
    return err;
  }
  return null;
}

/**
 * Initialize an MCP session. Cached; safe to call concurrently.
 */
async function initializeSession() {
  if (sessionId) return sessionId;
  if (sessionInitPromise) return sessionInitPromise;

  sessionInitPromise = (async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'vasu-realty-blog', version: '1.0.0' },
      },
    });
    const res = await signedRequest({
      rawRequestBody: body,
      functionName: 'initialize',
    });
    if (!sessionId) {
      throw new MCPError('AutoSocial MCP did not return a session id during initialize.', { code: 'MCP_SESSION_MISSING' });
    }
    logger.info('autosocial mcp: session initialized', { sessionId: sessionId.slice(0, 16) + '…' });
    return sessionId;
  })().finally(() => {
    sessionInitPromise = null;
  });

  return sessionInitPromise;
}

function resetSession() {
  sessionId = null;
}

/**
 * Perform a JSON-RPC 2.0 request (method + params). Handles session init and
 * transparent re-init when the session expires.
 */
async function rpc(method, params = {}) {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params });

  const attempt = async () => {
    await initializeSession();
    const correlationId = `mcpreq-${crypto.randomBytes(6).toString('hex')}`;
    try {
      const result = await signedRequest({
        rawRequestBody: payload,
        functionName: method,
        extraHeaders: sessionId ? { 'Mcp-Session-Id': sessionId } : {},
      });
      const rpcErr = extractRpcError(result, correlationId);
      if (rpcErr) throw rpcErr;
      return result.result !== undefined ? result.result : result;
    } catch (err) {
      if (err instanceof MCPError && isSessionError(err)) {
        logger.warn('autosocial mcp: session expired, re-initializing', { correlationId: err.correlationId });
        resetSession();
        throw err;
      }
      throw err;
    }
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof MCPError && err.code === 'MCP_SESSION_ERROR') {
      // One transparent retry with a fresh session.
      return attempt();
    }
    throw err;
  }
}

/**
 * Call an MCP tool by name. Returns the parsed tool output (prefers the
 * `content[].text` payload, JSON-decoded when possible).
 *
 * The server signals tool-level failures in two ways: `isError: true` on the
 * JSON-RPC result, or an HTTP-200 "failure envelope" in the payload itself
 * (e.g. `{ success: false, error: "MISSING_CONTEXT" }`). Both are surfaced
 * as structured MCPError so a degraded tool is never silently treated as
 * real data.
 */
async function toolCall(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args });
  if (result && result.isError) {
    const detail = Array.isArray(result.content) ? result.content.map((c) => c.text).join(' ') : 'Tool error';
    throw new MCPError(`AutoSocial MCP tool ${name} failed: ${detail.slice(0, 300)}`, { code: 'MCP_TOOL_ERROR' });
  }
  if (Array.isArray(result.content) && result.content.length) {
    const text = result.content.map((c) => c.text || '').filter(Boolean).join('\n');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text; // non-JSON payload (plain text) — pass through
    }
    return parseToolOutput(name, parsed);
  }
  return parseToolOutput(name, result);
}

/**
 * Reject payloads that carry an explicit failure signal even though the
 * HTTP/JSON-RPC layer succeeded: `success: false` with an error/summary, or a
 * non-empty `error` string (e.g. "Organization context missing").
 */
function parseToolOutput(name, output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const errorStr = typeof output.error === 'string' ? output.error.trim() : '';
  const summaryStr = typeof output.summary === 'string' ? output.summary.trim() : '';
  // success === false is the server's own failure signal (e.g. MISSING_CONTEXT,
  // org context missing). It is never a legitimate "empty but healthy" result.
  const hasErrorSignal = output.success === false || errorStr.length > 0;
  if (hasErrorSignal) {
    const detail = summaryStr || errorStr || 'success: false';
    throw new MCPError(`AutoSocial MCP tool ${name} returned a failure payload: ${detail.slice(0, 300)}`, {
      code: 'MCP_TOOL_ERROR',
    });
  }
  return output;
}

// ============================================================
// MCP workflow functions (blog generation inputs)
// ============================================================

/** Live business snapshot: portfolio analytics (active/pending/sold + activity). */
async function fetchLiveSnapshot() {
  return toolCall('getPropertyPortfolioAnalytics', { includeSold: true, daysBack: 30 });
}

/** Current property listings across farmed ZIPs. */
async function fetchListings() {
  return toolCall('getZipFarmingProperties', { take: 200 });
}

/** Neighborhood-level intelligence: weather, local events, news, hyperlocal drafts. */
async function fetchNeighborhoodInsights() {
  return toolCall('query_hyperlocal_intelligence', {
    focus: 'all',
    includeWeather: true,
    includeEvents: true,
    includeNews: true,
  });
}

/** Market statistics: portfolio analytics including sold history. */
async function fetchMarketStats() {
  return toolCall('getPropertyPortfolioAnalytics', { includeSold: true, daysBack: 365 });
}

/** Recent social activity: comments/interactions across platforms. */
async function fetchRecentActivity() {
  return toolCall('get-platform-comments', { platform: 'all', limit: 50, recentHours: 24 * 7 });
}

/**
 * Fetch the complete snapshot bundle used by blog generation.
 * Each function failure is reported individually so a single degraded
 * endpoint never silently blanks the article context.
 */
async function fetchSnapshotBundle() {
  assertConfigured();
  const results = {};
  const failures = {};

  const calls = {
    snapshot: fetchLiveSnapshot,
    listings: fetchListings,
    neighborhoods: fetchNeighborhoodInsights,
    market: fetchMarketStats,
    activity: fetchRecentActivity,
  };

  await Promise.all(
    Object.entries(calls).map(async ([key, fn]) => {
      try {
        results[key] = await fn();
      } catch (err) {
        failures[key] = { code: err.code, message: err.message, correlationId: err.correlationId };
        logger.warn(`autosocial mcp: bundle member ${key} failed`, { code: err.code, message: err.message, correlationId: err.correlationId });
      }
    })
  );

  return { results, failures };
}

module.exports = {
  MCPError,
  getConfigStatus,
  getMcpStatus,
  assertConfigured,
  currentTimestamp,
  buildSignature,
  buildHeaders,
  initializeSession,
  resetSession,
  rpc,
  toolCall,
  signedRequest,
  parseResponseBody,
  parseToolOutput,
  fetchLiveSnapshot,
  fetchListings,
  fetchNeighborhoodInsights,
  fetchMarketStats,
  fetchRecentActivity,
  fetchSnapshotBundle,
};
