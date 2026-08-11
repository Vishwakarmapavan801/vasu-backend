const blogService = require('../services/blogService');

async function list(req, res, next) {
  try {
    const result = await blogService.listArticles(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const article = await blogService.getArticleBySlug(req.params.slug);
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    // Fire-and-forget view increment (never blocks the response).
    blogService.recordView(req.params.slug);
    const related = await blogService.getRelatedArticles(req.params.slug);
    res.json({ success: true, article, related });
  } catch (err) { next(err); }
}

async function meta(req, res, next) {
  try {
    const result = await blogService.getBlogMeta();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function stats(req, res, next) {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const insights = await blogService.getMarketInsights({ forceRefresh });
    res.json({ success: true, stats: insights });
  } catch (err) { next(err); }
}

async function featured(req, res, next) {
  try {
    const articles = await blogService.getFeaturedArticles({ limit: req.query.limit });
    res.json({ success: true, articles });
  } catch (err) { next(err); }
}

module.exports = { list, detail, meta, stats, featured };
