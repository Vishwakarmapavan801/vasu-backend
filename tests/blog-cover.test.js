/**
 * Cover image fallback chain tests:
 *   OpenAI generation → MCP listing photo → branded fallback.
 */

jest.mock('../src/services/openaiService', () => ({
  getClient: jest.fn(() => {
    throw new Error('no client');
  }),
  chatCompletion: jest.fn(),
}));

const { createBrandedFallbackCover, pickPrimaryPhoto } = require('../src/modules/blog/services/aiBlogGenerator');

describe('branded fallback cover', () => {
  test('renders a 1200x630 JPEG buffer', async () => {
    const cover = await createBrandedFallbackCover({ title: 'Best neighborhoods in Charlotte' });
    expect(cover.source).toBe('branded_fallback');
    expect(cover.width).toBe(1200);
    expect(cover.height).toBe(630);
    expect(cover.mimeType).toBe('image/jpeg');
    // JPEG magic bytes.
    expect(cover.buffer[0]).toBe(0xff);
    expect(cover.buffer[1]).toBe(0xd8);
    expect(cover.buffer.length).toBeGreaterThan(1000);
  });

  test('does not throw on long or empty titles', async () => {
    await expect(createBrandedFallbackCover({ title: 'x'.repeat(500) })).resolves.toBeDefined();
    await expect(createBrandedFallbackCover({ title: '' })).resolves.toBeDefined();
  });
});

describe('MCP listing photo extraction', () => {
  test('picks the first absolute photo URL from nested media', () => {
    const listings = [
      { address: '1 Main St', Media: [{ MediaURL: 'https://cdn.example/1.jpg' }] },
    ];
    expect(pickPrimaryPhoto(listings)).toBe('https://cdn.example/1.jpg');
  });

  test('prefers nested media over flat fields', () => {
    const listings = [
      { Media: [{ MediaURL: 'https://cdn.example/nested.jpg' }], photo: 'https://cdn.example/flat.jpg' },
    ];
    expect(pickPrimaryPhoto(listings)).toBe('https://cdn.example/nested.jpg');
  });

  test('returns null when no photos exist', () => {
    expect(pickPrimaryPhoto([{ address: 'x' }])).toBeNull();
    expect(pickPrimaryPhoto([])).toBeNull();
    expect(pickPrimaryPhoto(null)).toBeNull();
  });
});
