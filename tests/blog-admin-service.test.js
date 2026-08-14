/**
 * Unit tests for pure helpers in blogAdminService + the not-configured
 * failure path of the generation pipeline.
 *
 * The database pool is mocked so no real DB is needed.
 */

jest.mock('../src/config/database', () => {
  const fakePool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn(),
  };
  return fakePool;
});

jest.mock('../src/services/autosocial/mcpClient', () => {
  const actual = jest.requireActual('../src/services/autosocial/mcpClient');
  return {
    ...actual,
    getConfigStatus: jest.fn(() => ({ configured: false, missing: ['AUTOSOCIAL_MCP_BASE_URL', 'AUTOSOCIAL_API_KEY', 'AUTOSOCIAL_HMAC_SECRET'], baseUrl: null })),
    fetchSnapshotBundle: jest.fn(),
  };
});

const { slugify, estimateReadTime, inferCategory } = require('../src/modules/blog/services/blogAdminService');

describe('blogAdminService helpers', () => {
  test('slugify produces URL-safe slugs', () => {
    expect(slugify("Best Neighborhoods in Charlotte for First-Time Home Buyers")).toBe('best-neighborhoods-in-charlotte-for-first-time-home-buyers');
    expect(slugify('  UPPER  & Lower  Case!! ')).toBe('upper-lower-case');
    expect(slugify("O'Brien's 123")).toBe('obriens-123');
    expect(slugify('')).toBe('');
  });

  test('estimateReadTime computes minutes from HTML content', () => {
    const html = '<h2>Intro</h2><p>' + Array(440).fill('word').join(' ') + '</p>';
    // 440 words / 220 wpm ≈ 2 minutes
    expect(estimateReadTime(html)).toBe(2);
    expect(estimateReadTime('<p>tiny</p>')).toBe(1);
  });

  test('inferCategory maps topics to blog categories', () => {
    expect(inferCategory({ tags: [] }, 'Best neighborhoods for first-time home buyers')).toBe('Buyer Guides');
    expect(inferCategory({ tags: [] }, 'Where to live in Charlotte 2026')).toBe('Neighborhood Guides');
    expect(inferCategory({ tags: [] }, 'Charlotte housing market trends and prices')).toBe('Market Trends');
    expect(inferCategory({ tags: ['Rentals'] }, 'Rental market overview')).toBe('Market Trends');
    expect(inferCategory({ tags: [] }, 'Rental property insights')).toBe('Market Insights');
  });
});

describe('blogAdminService generation failure path (MCP not configured)', () => {
  test('generateAndStore rejects with a clear error and records a FAILED job', async () => {
    const pool = require('../src/config/database');
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', topic: 'x', status: 'PENDING', trigger_type: 'admin' }] }) // create job
      .mockResolvedValueOnce({ rows: [{ id: 'job-1' }] }); // update RUNNING

    const { generateAndStore } = require('../src/modules/blog/services/blogAdminService');

    await expect(generateAndStore({ topic: 'Charlotte market' })).rejects.toThrow(/AutoSocial MCP is not configured/);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO blog_generation_jobs'),
      expect.arrayContaining(['Charlotte market'])
    );
  });

  test('generation fails loudly when every MCP bundle member is degraded (e.g. missing org context)', async () => {
    jest.resetModules();
    jest.mock('../src/config/database', () => {
      const fakePool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        connect: jest.fn(),
      };
      return fakePool;
    });
    const pool = require('../src/config/database');
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'job-2', topic: 'x', status: 'PENDING', trigger_type: 'admin' }] }) // create job
      .mockResolvedValueOnce({ rows: [{ id: 'job-2' }] }); // update RUNNING

    const failMsg = 'AutoSocial MCP tool getPropertyPortfolioAnalytics returned a failure payload: Organization context missing. Pass a valid X-Org-Id header.';
    const mcp = require('../src/services/autosocial/mcpClient');
    mcp.getConfigStatus.mockReturnValue({ configured: true, missing: [], baseUrl: 'https://x', orgIdConfigured: false });
    mcp.fetchSnapshotBundle.mockResolvedValue({
      results: { snapshot: null, listings: null, neighborhoods: null, market: null, activity: null },
      failures: {
        snapshot: { code: 'MCP_TOOL_ERROR', message: failMsg },
        listings: { code: 'MCP_TOOL_ERROR', message: failMsg },
        neighborhoods: { code: 'MCP_TOOL_ERROR', message: failMsg },
        market: { code: 'MCP_TOOL_ERROR', message: failMsg },
        activity: { code: 'MCP_TOOL_ERROR', message: failMsg },
      },
    });

    const { generateAndStore } = require('../src/modules/blog/services/blogAdminService');

    await expect(generateAndStore({ topic: 'Charlotte market' })).rejects.toThrow(/Organization context missing/);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE blog_generation_jobs SET status = '),
      expect.arrayContaining(['FAILED'])
    );
  });
});
