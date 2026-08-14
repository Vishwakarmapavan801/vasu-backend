/**
 * Verifies the AutoSocial MCP HMAC signing exactly matches the spec:
 *   signature = HMAC_SHA256(key = SHA256(HMAC_SECRET),
 *                          data = "{timestamp}.{rawRequestBody}")
 */

const crypto = require('crypto');

// Independent re-implementation of the spec (no code under test) so the
// expected vector is computed from the formula, not from the implementation.
function expectedSignature({ secret, timestamp, rawRequestBody, encoding = 'hex' }) {
  const key = crypto.createHash('sha256').update(secret, 'utf8').digest();
  const data = `${timestamp}.${rawRequestBody}`;
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding === 'base64' ? 'base64' : 'hex');
}

// Config values injected via env before requiring the client.
beforeEach(() => {
  process.env.AUTOSOCIAL_MCP_BASE_URL = 'https://mcp.autosocial.example';
  process.env.AUTOSOCIAL_API_KEY = 'test-api-key';
  process.env.AUTOSOCIAL_HMAC_SECRET = 'super-secret-hmac';
  delete process.env.AUTOSOCIAL_SIGNATURE_ENCODING;
  delete process.env.AUTOSOCIAL_TIMESTAMP_UNIT;
});

afterEach(() => {
  delete process.env.AUTOSOCIAL_MCP_BASE_URL;
  delete process.env.AUTOSOCIAL_API_KEY;
  delete process.env.AUTOSOCIAL_HMAC_SECRET;
  delete process.env.AUTOSOCIAL_SIGNATURE_ENCODING;
  delete process.env.AUTOSOCIAL_TIMESTAMP_UNIT;
  jest.resetModules();
});

describe('AutoSocial MCP HMAC signing', () => {
  test('signature matches the spec formula for a JSON body', () => {
    const { buildSignature, currentTimestamp } = require('../src/services/autosocial/mcpClient');
    const rawBody = JSON.stringify({ request_id: 'abc-123' });
    const timestamp = currentTimestamp();

    const got = buildSignature({ timestamp, rawRequestBody: rawBody, secret: 'super-secret-hmac' });
    const want = expectedSignature({
      secret: 'super-secret-hmac',
      timestamp,
      rawRequestBody: rawBody,
    });
    expect(got).toBe(want);
  });

  test('signature with empty body uses "{timestamp}." as data', () => {
    const { buildSignature, currentTimestamp } = require('../src/services/autosocial/mcpClient');
    const timestamp = currentTimestamp();
    const got = buildSignature({ timestamp, rawRequestBody: '', secret: 'super-secret-hmac' });
    const want = expectedSignature({ secret: 'super-secret-hmac', timestamp, rawRequestBody: '' });
    expect(got).toBe(want);
  });

  test('signature is deterministic for identical inputs and changes with timestamp', () => {
    const { buildSignature } = require('../src/services/autosocial/mcpClient');
    const body = '{"a":1}';
    const s1 = buildSignature({ timestamp: '1700000000', rawRequestBody: body, secret: 'super-secret-hmac' });
    const s2 = buildSignature({ timestamp: '1700000000', rawRequestBody: body, secret: 'super-secret-hmac' });
    const s3 = buildSignature({ timestamp: '1700000001', rawRequestBody: body, secret: 'super-secret-hmac' });
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
  });

  test('request headers contain the three required auth headers', () => {
    const { buildHeaders, currentTimestamp } = require('../src/services/autosocial/mcpClient');
    const ts = currentTimestamp();
    const headers = buildHeaders('{"x":1}', ts);
    expect(headers['X-AutoSocial-Key']).toBe('test-api-key');
    expect(headers['X-Timestamp']).toBe(ts);
    expect(headers['X-MCP-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  test('base64 signature encoding is supported', () => {
    process.env.AUTOSOCIAL_SIGNATURE_ENCODING = 'base64';
    jest.resetModules();
    const { buildSignature } = require('../src/services/autosocial/mcpClient');
    const got = buildSignature({ timestamp: '1700000000', rawRequestBody: '{}', secret: 'super-secret-hmac' });
    const want = expectedSignature({ secret: 'super-secret-hmac', timestamp: '1700000000', rawRequestBody: '{}', encoding: 'base64' });
    expect(got).toBe(want);
  });

  test('millisecond timestamps are supported', () => {
    process.env.AUTOSOCIAL_TIMESTAMP_UNIT = 'ms';
    jest.resetModules();
    const { currentTimestamp } = require('../src/services/autosocial/mcpClient');
    const ts = currentTimestamp();
    expect(ts).toMatch(/^\d{13}$/);
  });

  test('config status reports missing env vars', () => {
    delete process.env.AUTOSOCIAL_MCP_BASE_URL;
    delete process.env.AUTOSOCIAL_API_KEY;
    delete process.env.AUTOSOCIAL_HMAC_SECRET;
    jest.resetModules();
    const { getConfigStatus } = require('../src/services/autosocial/mcpClient');
    const status = getConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(expect.arrayContaining(['AUTOSOCIAL_MCP_BASE_URL', 'AUTOSOCIAL_API_KEY', 'AUTOSOCIAL_HMAC_SECRET']));
  });
});
