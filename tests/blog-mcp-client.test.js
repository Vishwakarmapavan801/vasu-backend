/**
 * MCP client tests: HMAC headers (incl. server-required X-MCP-Timestamp),
 * JSON-RPC session handling, tool calls, retry behavior and errors.
 */

jest.mock('axios', () => {
  const mockFn = jest.fn();
  return mockFn;
});

const axios = require('axios');

const SESSION_ID = 'test-session-123';

function sse(data) {
  return `event: message\ndata: ${JSON.stringify(data)}\n\n`;
}

beforeEach(() => {
  process.env.AUTOSOCIAL_MCP_BASE_URL = 'https://mcp.autosocial.example';
  process.env.AUTOSOCIAL_API_KEY = 'test-api-key';
  process.env.AUTOSOCIAL_HMAC_SECRET = 'super-secret-hmac';
  delete process.env.AUTOSOCIAL_SIGNATURE_ENCODING;
  delete process.env.AUTOSOCIAL_TIMESTAMP_UNIT;
  axios.mockReset();
  require('../src/services/autosocial/mcpClient').resetSession();
});

afterEach(() => {
  delete process.env.AUTOSOCIAL_MCP_BASE_URL;
  delete process.env.AUTOSOCIAL_API_KEY;
  delete process.env.AUTOSOCIAL_HMAC_SECRET;
  delete process.env.AUTOSOCIAL_SIGNATURE_ENCODING;
  delete process.env.AUTOSOCIAL_TIMESTAMP_UNIT;
});

describe('AutoSocial MCP client — HMAC headers', () => {
  test('signature matches the spec formula for a JSON body', () => {
    const crypto = require('crypto');
    const { buildSignature, currentTimestamp } = require('../src/services/autosocial/mcpClient');
    const rawBody = JSON.stringify({ request_id: 'abc-123' });
    const timestamp = currentTimestamp();

    const got = buildSignature({ timestamp, rawRequestBody: rawBody, secret: 'super-secret-hmac' });
    const key = crypto.createHash('sha256').update('super-secret-hmac', 'utf8').digest();
    const want = crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
    expect(got).toBe(want);
  });

  test('buildHeaders contains all required auth headers incl. X-MCP-Timestamp', () => {
    const { buildHeaders } = require('../src/services/autosocial/mcpClient');
    const headers = buildHeaders('{"x":1}', '1700000000', 'mcpreq-abc');
    expect(headers['X-AutoSocial-Key']).toBe('test-api-key');
    expect(headers['X-Timestamp']).toBe('1700000000');
    expect(headers['X-MCP-Timestamp']).toBe('1700000000');
    expect(headers['X-MCP-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['X-Correlation-ID']).toBe('mcpreq-abc');
  });
});

describe('AutoSocial MCP client — JSON-RPC session + tools', () => {
  test('initialize obtains a session and toolCall sends it on every request', async () => {
    let call = 0;
    axios.mockImplementation(async (cfg) => {
      call += 1;
      if (call === 1) {
        return { status: 200, headers: { 'mcp-session-id': SESSION_ID }, data: sse({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } }) };
      }
      expect(cfg.headers['Mcp-Session-Id']).toBe(SESSION_ID);
      return {
        status: 200,
        headers: {},
        data: sse({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify({ listings: 5 }) }] } }),
      };
    });

    const { toolCall } = require('../src/services/autosocial/mcpClient');
    const result = await toolCall('getZipFarmingProperties', { take: 10 });

    expect(call).toBe(2);
    expect(result).toEqual({ listings: 5 });

    const [initCfg, callCfg] = axios.mock.calls.map((c) => c[0]);
    expect(initCfg.url).toBe('https://mcp.autosocial.example');
    expect(JSON.parse(initCfg.data).method).toBe('initialize');
    expect(JSON.parse(callCfg.data).method).toBe('tools/call');
    expect(JSON.parse(callCfg.data).params).toEqual({ name: 'getZipFarmingProperties', arguments: { take: 10 } });
  });

  test('session expiry re-initializes and retries the tool call once', async () => {
    let call = 0;
    axios.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return { status: 200, headers: { 'mcp-session-id': SESSION_ID }, data: sse({ jsonrpc: '2.0', id: 1, result: {} }) };
      }
      if (call === 2) {
        // Stale session rejected.
        return { status: 200, headers: {}, data: sse({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'No valid session ID provided' } }) };
      }
      // Fresh session: re-init + successful call.
      if (call === 3) {
        return { status: 200, headers: { 'mcp-session-id': 'fresh-session' }, data: sse({ jsonrpc: '2.0', id: 3, result: {} }) };
      }
      return { status: 200, headers: {}, data: sse({ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: 'ok' }] } }) };
    });

    const { toolCall } = require('../src/services/autosocial/mcpClient');
    const result = await toolCall('getPropertyPortfolioAnalytics', {});
    expect(result).toBe('ok');
    expect(call).toBe(4); // init + stale call + re-init + retry
  });

  test('tool errors are surfaced as MCPError', async () => {
    axios.mockImplementation(async (cfg) => {
      const req = JSON.parse(cfg.data);
      if (req.method === 'initialize') {
        return { status: 200, headers: { 'mcp-session-id': SESSION_ID }, data: sse({ jsonrpc: '2.0', id: req.id, result: {} }) };
      }
      return {
        status: 200,
        headers: {},
        data: sse({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'nope' }], isError: true } }),
      };
    });
    const { toolCall } = require('../src/services/autosocial/mcpClient');
    await expect(toolCall('query_hyperlocal_intelligence', {})).rejects.toMatchObject({ code: 'MCP_TOOL_ERROR' });
  });

  test('HTTP-200 failure envelopes are not silently treated as data', async () => {
    const { parseToolOutput } = require('../src/services/autosocial/mcpClient');

    // e.g. query_hyperlocal_intelligence with a missing org context.
    expect(() => parseToolOutput('query_hyperlocal_intelligence', {
      success: false,
      summary: 'Organization context missing.',
      error: 'MISSING_CONTEXT',
    })).toThrow(/MCP_TOOL_ERROR|Organization context missing/);

    // e.g. getPropertyPortfolioAnalytics with an inline error string.
    expect(() => parseToolOutput('getPropertyPortfolioAnalytics', {
      mlsVerified: false,
      portfolioSummary: null,
      error: 'Organization context missing. Pass a valid X-Org-Id header.',
    })).toThrow(/MCP_TOOL_ERROR|Organization context missing/);

    // A healthy payload passes through untouched.
    const healthy = { mlsVerified: true, portfolioSummary: { totalActive: 3 } };
    expect(parseToolOutput('getPropertyPortfolioAnalytics', healthy)).toEqual(healthy);

    // The server's own `success: false` flag is always a failure signal,
    // even without an error string (e.g. get-platform-comments degraded).
    expect(() => parseToolOutput('get-platform-comments', { success: false, comments: [], total: 0 })).toThrow(/success: false/);
  });

  test('toolCall throws on degraded payloads so bundles record failures', async () => {
    axios.mockImplementation(async (cfg) => {
      const req = JSON.parse(cfg.data);
      if (req.method === 'initialize') {
        return { status: 200, headers: { 'mcp-session-id': SESSION_ID }, data: sse({ jsonrpc: '2.0', id: req.id, result: {} }) };
      }
      return {
        status: 200,
        headers: {},
        data: sse({
          jsonrpc: '2.0',
          id: req.id,
          result: { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'MISSING_CONTEXT' }) }] },
        }),
      };
    });
    const { toolCall } = require('../src/services/autosocial/mcpClient');
    await expect(toolCall('query_hyperlocal_intelligence', {})).rejects.toMatchObject({ code: 'MCP_TOOL_ERROR' });
  });
});

describe('AutoSocial MCP client — HTTP behavior', () => {
  test('signedRequest retries transient 500s and sends all auth headers', async () => {
    let calls = 0;
    axios.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw { response: { status: 500, data: { error: 'boom' } } };
      return { status: 200, headers: {}, data: JSON.stringify({ status: 'ok' }) };
    });

    const { signedRequest } = require('../src/services/autosocial/mcpClient');
    const result = await signedRequest({ path: '/health', functionName: 'health', retries: 2 });

    expect(result).toEqual({ status: 'ok' });
    expect(calls).toBe(2);

    const [cfg] = axios.mock.calls[0];
    expect(cfg.headers['X-AutoSocial-Key']).toBe('test-api-key');
    expect(cfg.headers['X-MCP-Timestamp']).toBeDefined();
    expect(cfg.headers['X-MCP-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(cfg.headers['X-Correlation-ID']).toMatch(/^mcpreq-/);
  });

  test('auth failures are not retried', async () => {
    axios.mockImplementation(async () => {
      throw { response: { status: 401, data: { error: 'bad signature' } } };
    });

    const { signedRequest } = require('../src/services/autosocial/mcpClient');
    await expect(signedRequest({ path: '/health', functionName: 'health', retries: 3 }))
      .rejects.toMatchObject({ name: 'MCPError', code: 'MCP_AUTH_FAILED', retries: 0 });
    expect(axios).toHaveBeenCalledTimes(1);
  });

  test('getMcpStatus reports connectivity + authentication from /health', async () => {
    axios.mockImplementation(async () => ({
      status: 200,
      headers: {},
      data: JSON.stringify({ status: 'ok', service: 'autosocial-mcp-v1', tools: 29 }),
    }));

    const { getMcpStatus } = require('../src/services/autosocial/mcpClient');
    const status = await getMcpStatus();
    expect(status.configured).toBe(true);
    expect(status.connectivity).toBe('ok');
    expect(status.authenticated).toBe(true);
    expect(status.service).toBe('autosocial-mcp-v1');
    expect(status.tools).toBe(29);
  });

});
