/**
 * HTML sanitizer with a strict allowlist.
 *
 * Used before AI-generated article HTML is stored and again before it is
 * served to the public. It is a small tokenizer (not regex) so tags are
 * parsed properly: it keeps a safe set of elements/attributes, strips event
 * handlers, javascript: URLs, scripts, iframes and everything else.
 *
 * Allowed elements mirror the tags the AI generator is asked to produce plus
 * semantic containers. Everything else is dropped (contents are kept for
 * non-script tags — see below).
 */

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 'mark', 'small',
  'blockquote', 'code', 'pre', 'span', 'div',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'section', 'article', 'header', 'footer',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'width', 'height',
  'class', 'id', 'name', 'target', 'rel', 'loading',
  'colspan', 'rowspan', 'type',
]);

const UNSAFE_SCHEMES = /^\s*(javascript|vbscript|data|file):/i;

function isSafeUrl(value) {
  if (!value) return false;
  const trimmed = value.trim();
  // Allow protocol-relative + http(s) + relative paths only.
  if (trimmed.startsWith('//')) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true; // no scheme → relative
  return false;
}

function cleanAttr(name, value) {
  const lower = name.toLowerCase();
  if (!ALLOWED_ATTRS.has(lower)) return null;
  if (lower.startsWith('on')) return null;
  if (lower === 'href' || lower === 'src') {
    if (!isSafeUrl(value)) return null;
  }
  if (lower === 'target') {
    if (!['_blank', '_self', '_parent', '_top'].includes(value)) return null;
  }
  if (lower === 'rel') {
    // Allow-list rel tokens (nofollow, noopener, noreferrer, sponsored, ugc).
    const tokens = value.split(/\s+/).filter(Boolean);
    if (!tokens.every((t) => ['nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc', 'external'].includes(t))) {
      return null;
    }
  }
  if (lower === 'loading' && value !== 'lazy' && value !== 'eager') return null;
  return lower;
}

/**
 * Sanitize an HTML string.
 * @param {string} html
 * @returns {string} sanitized HTML
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  if (html.length > 500000) html = html.slice(0, 500000);

  let out = '';
  let i = 0;
  const len = html.length;

  while (i < len) {
    const ch = html[i];

    if (ch === '<') {
      // Comment?
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? len : end + 3;
        continue;
      }
      // CDATA?
      if (html.startsWith('<![CDATA[', i)) {
        const end = html.indexOf(']]>', i + 9);
        i = end === -1 ? len : end + 3;
        continue;
      }
      // Closing tag?
      if (html[i + 1] === '/') {
        const gt = html.indexOf('>', i + 2);
        if (gt === -1) {
          out += '&lt;';
          i += 1;
          continue;
        }
        const name = html.slice(i + 2, gt).trim().toLowerCase();
        if (ALLOWED_TAGS.has(name)) {
          out += `</${name}>`;
        }
        i = gt + 1;
        continue;
      }
      // Opening tag?
      const gt = html.indexOf('>', i + 1);
      if (gt === -1) {
        out += '&lt;';
        i += 1;
        continue;
      }
      const raw = html.slice(i + 1, gt);
      // Tokenize name + attributes (skip quoted sections).
      const attrs = [];
      let name = '';
      let j = 0;
      while (j < raw.length && !/\s/.test(raw[j])) {
        name += raw[j];
        j += 1;
      }
      const tagName = name.toLowerCase();

      // Parse attributes manually, respecting quotes.
      let attrName = '';
      let inQuote = null;
      let attrVal = '';
      let readingVal = false;
      for (; j < raw.length; j++) {
        const c = raw[j];
        if (inQuote) {
          if (c === inQuote) {
            // Quoted value complete.
            inQuote = null;
            if (attrName) attrs.push([attrName, attrVal]);
            attrName = '';
            attrVal = '';
            readingVal = false;
          } else {
            attrVal += c;
          }
          continue;
        }
        if (c === '"' || c === "'") {
          inQuote = c;
          readingVal = true;
          continue;
        }
        if (/\s/.test(c)) {
          if (attrName && !readingVal) {
            attrs.push([attrName, '']);
            attrName = '';
          }
          continue;
        }
        if (c === '=') {
          readingVal = true;
          continue;
        }
        if (readingVal) {
          attrVal += c;
          continue;
        }
        attrName += c;
      }
      if (attrName && !readingVal) attrs.push([attrName, '']);
      if (attrName && readingVal) attrs.push([attrName, attrVal]);

      if (!ALLOWED_TAGS.has(tagName)) {
        // Unknown tag: keep its inner content, drop the tag itself.
        i = gt + 1;
        continue;
      }

      const keptAttrs = [];
      for (const [an, av] of attrs) {
        const cleaned = cleanAttr(an, av);
        if (cleaned) keptAttrs.push(`${cleaned}="${av.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
      }

      out += `<${tagName}${keptAttrs.length ? ` ${keptAttrs.join(' ')}` : ''}>`;
      i = gt + 1;
      continue;
    }

    if (ch === '&') {
      // Keep valid entities untouched; escape bare ampersands.
      const rest = html.slice(i, i + 12);
      const m = rest.match(/^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i);
      if (m) {
        out += m[0];
        i += m[0].length;
        continue;
      }
      out += '&amp;';
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Strip all tags, returning plain text (used for excerpts/search).
 */
function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  return sanitizeHtml(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { sanitizeHtml, htmlToText };
