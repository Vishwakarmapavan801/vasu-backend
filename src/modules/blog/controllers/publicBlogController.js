const publicBlogService = require('../services/publicBlogService');

async function list(req, res, next) {
  try {
    const result = await publicBlogService.listPosts(req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

async function detail(req, res, next) {
  try {
    const result = await publicBlogService.getPostBySlug(req.params.slug);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    // Fire-and-forget view increment — never blocks the response.
    publicBlogService.recordView(req.params.slug);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

async function meta(req, res, next) {
  try {
    const result = await publicBlogService.getMeta();
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

async function sitemap(req, res, next) {
  try {
    const xml = await publicBlogService.getSitemapXml();
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.send(xml);
  } catch (err) {
    return next(err);
  }
}

async function rss(req, res, next) {
  try {
    const xml = await publicBlogService.getRssXml();
    res.set('Content-Type', 'application/rss+xml');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.send(xml);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, detail, meta, sitemap, rss };
