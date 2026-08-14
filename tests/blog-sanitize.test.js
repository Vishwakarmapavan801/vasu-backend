const { sanitizeHtml, htmlToText } = require('../src/utils/sanitize');

describe('HTML sanitizer', () => {
  test('allows safe article markup', () => {
    const input = '<h2>Pricing Trends</h2><p>Median list price is <strong>$450,000</strong>.</p><ul><li>One</li><li>Two</li></ul>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  test('strips script and iframe tags entirely', () => {
    const input = '<p>Hello</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><p>World</p>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<p>Hello</p>');
    expect(out).toContain('<p>World</p>');
  });

  test('removes event handler attributes', () => {
    const input = '<p onclick="alert(1)" onmouseover="x()">Safe</p><a href="/blog/x" onclick="steal()">Link</a>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('<p>Safe</p>');
    expect(out).toContain('<a href="/blog/x">Link</a>');
  });

  test('removes javascript: URLs', () => {
    const input = '<a href="javascript:alert(1)">Bad</a><a href="https://example.com">Good</a><img src="javascript:x">';
    const out = sanitizeHtml(input);
    expect(out).toContain('<a href="https://example.com">Good</a>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<img src="javascript');
  });

  test('drops unknown tags but keeps their content', () => {
    const input = '<div>Keep <marquee>text</marquee> here</div>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain('marquee');
    expect(out).toContain('Keep text here');
  });

  test('keeps valid HTML entities and escapes bare ampersands', () => {
    const input = 'A &amp; B & C &#39;quote&#39;';
    const out = sanitizeHtml(input);
    expect(out).toContain('A &amp; B');
    // Bare ampersand must be escaped to &amp; (no double-encoding of valid entities).
    expect(out).toContain('&amp; C');
    expect(out).toContain('&#39;quote&#39;');
  });

  test('sanitizes nested/inline styles and comments', () => {
    const input = '<p>Text<!-- comment --></p><style>body{}</style>';
    const out = sanitizeHtml(input);
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('<style');
    expect(out).toContain('<p>Text</p>');
  });

  test('htmlToText strips tags', () => {
    expect(htmlToText('<h2>Title</h2><p>Some <strong>bold</strong> text.</p>')).toBe('Title Some bold text.');
  });
});
